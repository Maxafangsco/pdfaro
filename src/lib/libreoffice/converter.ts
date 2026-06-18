/**
 * LibreOffice WASM Converter
 * 
 * Uses @matbee/libreoffice-converter WorkerBrowserConverter for document conversion.
 * 
 * Key design decisions:
 * 1. Uses WorkerBrowserConverter instead of BrowserConverter — runs WASM in a
 *    dedicated Web Worker, avoiding main-thread blocking and eliminating the need
 *    for fragile loadModule patches / Cloudflare Rocket Loader workarounds
 * 2. Resolves asset variants at runtime (soffice.wasm / soffice.wasm.gz and
 *    soffice.data / soffice.data.gz) so development and production deployments
 *    both work regardless of whether uncompressed files are present.
 * 3. Specifies browserWorkerJs for the library's internal worker communication
 * 4. Checks SharedArrayBuffer support upfront — fails fast with a clear error
 * 
 * IMPORTANT: The browser.worker.global.js in public/libreoffice-wasm/ MUST match
 * the version from @matbee/libreoffice-converter/dist/. Do NOT modify it — the
 * library's WorkerBrowserConverter expects an unmodified worker script. If you
 * need CJK font support, fonts must be pre-baked into soffice.data.
 * 
 * How pthreads work:
 * - soffice.js (Emscripten glue) creates 4 pthread Workers via
 *   new Worker(Module["mainScriptUrlOrBlob"]) — loading soffice.js itself
 * - Each pthread Worker detects ENVIRONMENT_IS_PTHREAD from self.name ("em-pthread-N")
 * - These are NESTED Workers (created from inside the browser.worker.global.js Worker)
 * - They must NOT run from a Blob URL parent, or nested Worker creation breaks
 */

import { WorkerBrowserConverter } from '@matbee/libreoffice-converter/browser';
import { fetchAssembledBlob } from '../utils/asset-loader';

const LIBREOFFICE_PATH = '/libreoffice-wasm/';
const ASSET_VERSION = '20240212-3';
const SOFFICE_WASM_FILE = 'soffice.wasm';
const SOFFICE_DATA_FILE = 'soffice.data';
const SOFFICE_WASM_CANDIDATES = [SOFFICE_WASM_FILE, 'soffice.wasm.gz'] as const;
const SOFFICE_DATA_CANDIDATES = [SOFFICE_DATA_FILE, 'soffice.data.gz'] as const;

function normalizeBasePath(path: string): string {
    return path.endsWith('/') ? path : `${path}/`;
}

export interface LoadProgress {
    phase: 'loading' | 'initializing' | 'converting' | 'complete' | 'ready';
    percent: number;
    message: string;
}

export type ProgressCallback = (progress: LoadProgress) => void;

// Singleton for converter instance
let converterInstance: LibreOfficeConverter | null = null;

export class LibreOfficeConverter {
    private converter: WorkerBrowserConverter | null = null;
    private initialized = false;
    private initPromise: Promise<void> | null = null;
    private basePath: string;
    /** Total size of all WASM assets in MB, computed during environment check */
    private totalAssetSizeMB = 0;
    /** Replaceable progress callback — allows late-binding when preload started without one */
    private progressCallback?: ProgressCallback;
    /** Track Blob URLs for cleanup */
    private blobUrls: string[] = [];
    /** Resolved asset filenames (supports plain and .gz variants) */
    private sofficeWasmFile = SOFFICE_WASM_FILE;
    private sofficeDataFile = SOFFICE_DATA_FILE;

    constructor(basePath?: string) {
        this.basePath = normalizeBasePath(basePath || LIBREOFFICE_PATH);
    }

    async initialize(onProgress?: ProgressCallback): Promise<void> {
        // Allow hot-swapping the progress callback even if init is already in flight.
        // This covers the case where preload started silently (no callback), and later
        // the user clicks "Convert" which provides a real callback.
        if (onProgress) this.progressCallback = onProgress;

        if (this.initialized) return;

        // If already initializing, wait for the existing promise
        if (this.initPromise) return this.initPromise;

        this.initPromise = this._doInitialize();
        try {
            await this.initPromise;
        } catch (e) {
            // Allow retry on failure
            this.initPromise = null;
            throw e;
        }
    }

    /**
     * Build a human-readable progress message.
     * When totalAssetSizeMB is known, shows "Downloading: X MB / Y MB".
     */
    private buildProgressMessage(info: { percent: number }): string {
        if (this.totalAssetSizeMB > 0 && info.percent < 95) {
            const downloadedMB = (info.percent / 100 * this.totalAssetSizeMB).toFixed(1);
            const totalMB = this.totalAssetSizeMB.toFixed(1);
            return `Downloading: ${downloadedMB} MB / ${totalMB} MB`;
        }
        if (info.percent >= 95 && info.percent < 100) {
            return 'Initializing conversion engine...';
        }
        return `Loading conversion engine (${Math.round(info.percent)}%)...`;
    }

    private async _doInitialize(): Promise<void> {
        try {
            this.progressCallback?.({ phase: 'loading', percent: 0, message: 'Checking environment...' });

            // Fail fast if SharedArrayBuffer / COOP+COEP is missing
            await this.checkEnvironment();

            const totalInfo = this.totalAssetSizeMB > 0
                ? ` (${this.totalAssetSizeMB.toFixed(1)} MB to download)`
                : '';
            this.progressCallback?.({ phase: 'loading', percent: 5, message: `Loading conversion engine${totalInfo}...` });

            // Fetch and reassemble large binary assets (handles chunking on Cloudflare Pages).
            // Keep JS worker scripts as normal same-origin URLs so nested pthread workers can boot.
            const [rawSofficeWasmBlob, rawSofficeDataBlob] = await Promise.all([
                fetchAssembledBlob(`${this.basePath}${this.sofficeWasmFile}?v=${ASSET_VERSION}`),
                fetchAssembledBlob(`${this.basePath}${this.sofficeDataFile}?v=${ASSET_VERSION}`),
            ]);

            const [sofficeWasmBlob, sofficeDataBlob] = await Promise.all([
                this.normalizeMaybeGzipBlob(rawSofficeWasmBlob, this.sofficeWasmFile, 'application/wasm'),
                this.normalizeMaybeGzipBlob(rawSofficeDataBlob, this.sofficeDataFile, 'application/octet-stream'),
            ]);

            const sofficeWasmUrl = URL.createObjectURL(sofficeWasmBlob);
            const sofficeDataUrl = URL.createObjectURL(sofficeDataBlob);
            this.blobUrls = [sofficeWasmUrl, sofficeDataUrl];

            const sofficeJsUrl = `${this.basePath}soffice.js?v=${ASSET_VERSION}`;
            const sofficeWorkerJsUrl = `${this.basePath}soffice.worker.js?v=${ASSET_VERSION}`;
            const browserWorkerJsUrl = `${this.basePath}browser.worker.global.js?v=${ASSET_VERSION}`;

            this.converter = new WorkerBrowserConverter({
                sofficeJs: sofficeJsUrl,
                sofficeWasm: sofficeWasmUrl,
                sofficeData: sofficeDataUrl,
                sofficeWorkerJs: sofficeWorkerJsUrl,
                browserWorkerJs: browserWorkerJsUrl,
                verbose: false,
                onProgress: (info: { phase: string; percent: number; message: string }) => {
                    // Use this.progressCallback so a late-arriving callback from the UI gets picked up
                    if (this.progressCallback && !this.initialized) {
                        this.progressCallback({
                            phase: info.phase as LoadProgress['phase'],
                            percent: info.percent,
                            message: this.buildProgressMessage(info),
                        });
                    }
                },
                onReady: () => {
                    console.log('[LibreOffice] Ready!');
                },
                onError: (error: Error) => {
                    console.error('[LibreOffice] Error:', error);
                },
            });

            console.log('[LibreOffice] Starting initialization via WorkerBrowserConverter...');
            const initStart = performance.now();
            try {
                await this.converter.initialize();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.toLowerCase().includes('wasm initialization timeout')) {
                    throw new Error(
                        'WASM initialization timeout. This is often caused by worker startup failures or cross-origin isolation issues. ' +
                        'Verify COOP/COEP headers and check [LibreOffice] console logs for worker/network errors.'
                    );
                }
                throw error;
            }
            const initDuration = Math.round(performance.now() - initStart);
            console.log(`[LibreOffice] Initialization completed in ${initDuration}ms`);

            this.initialized = true;

            // Signal completion
            this.progressCallback?.({ phase: 'ready', percent: 100, message: 'Conversion engine ready!' });

            // Null out the callback to prevent any late-firing progress updates
            this.progressCallback = undefined;
        } catch (e) {
            this.converter = null;
            this.initialized = false;
            throw e;
        }
    }

    private async resolveAssetVariant(
        logicalName: string,
        candidates: readonly string[],
    ): Promise<string> {
        for (const candidate of candidates) {
            const url = `${this.basePath}${candidate}?v=${ASSET_VERSION}`;
            const manifestUrl = `${this.basePath}${candidate}.manifest.json?v=${ASSET_VERSION}`;

            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok) {
                    if (candidate !== logicalName) {
                        console.warn(`[LibreOffice] ${logicalName}: using fallback asset ${candidate}`);
                    }
                    return candidate;
                }

                const manifestRes = await fetch(manifestUrl, { method: 'HEAD' });
                if (manifestRes.ok) {
                    console.warn(`[LibreOffice] ${logicalName}: using chunked asset manifest for ${candidate}`);
                    return candidate;
                }
            } catch {
                // Keep trying other variants.
            }
        }

        throw new Error(
            `Cannot locate ${logicalName}. Tried: ${candidates.join(', ')}`
        );
    }

    private async normalizeMaybeGzipBlob(
        blob: Blob,
        fileName: string,
        targetMimeType: string,
    ): Promise<Blob> {
        if (!fileName.endsWith('.gz')) return blob;

        const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        const isGzipStream = signature.length === 2 && signature[0] === 0x1f && signature[1] === 0x8b;

        if (!isGzipStream) {
            // Browser likely already decompressed based on Content-Encoding.
            return blob;
        }

        if (typeof DecompressionStream === 'undefined') {
            throw new Error(
                `${fileName} is gzip-compressed but this browser cannot decompress gzip streams.`
            );
        }

        console.warn(`[LibreOffice] ${fileName}: decompressing gzip payload in-browser`);
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        const decompressed = await new Response(stream).arrayBuffer();
        return new Blob([decompressed], { type: targetMimeType });
    }

    /**
     * Diagnose environment issues — fail fast if SharedArrayBuffer is not available.
     * SharedArrayBuffer requires Cross-Origin Isolation (COOP + COEP headers).
     */
    private async checkEnvironment(): Promise<void> {
        console.warn('[LibreOffice] === Environment Check ===');

        // 1. Check COOP/COEP — this is the #1 cause of WASM timeout
        const isIsolated = window.crossOriginIsolated;
        console.warn(`[LibreOffice] Cross-Origin Isolated: ${isIsolated ? 'YES ✅' : 'NO ❌'}`);

        // 2. Check SharedArrayBuffer directly
        const hasSAB = typeof SharedArrayBuffer !== 'undefined';
        console.warn(`[LibreOffice] SharedArrayBuffer: ${hasSAB ? 'Available ✅' : 'NOT available ❌'}`);

        if (!isIsolated || !hasSAB) {
            const errorMsg = [
                'LibreOffice WASM requires SharedArrayBuffer for multi-threading.',
                '',
                'SharedArrayBuffer is only available in Cross-Origin Isolated contexts.',
                'Your server MUST return these headers on ALL responses:',
                '  Cross-Origin-Opener-Policy: same-origin',
                '  Cross-Origin-Embedder-Policy: require-corp',
                '  Cross-Origin-Resource-Policy: cross-origin',
                '',
                `Current state: crossOriginIsolated=${isIsolated}, SharedArrayBuffer=${hasSAB}`,
            ].join('\n');
            console.error(`[LibreOffice] ${errorMsg}`);
            throw new Error(
                `SharedArrayBuffer is not available (crossOriginIsolated=${isIsolated}). ` +
                'Your server must set Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers. ' +
                'See browser console for details.'
            );
        }

        this.sofficeWasmFile = await this.resolveAssetVariant(SOFFICE_WASM_FILE, SOFFICE_WASM_CANDIDATES);
        this.sofficeDataFile = await this.resolveAssetVariant(SOFFICE_DATA_FILE, SOFFICE_DATA_CANDIDATES);

        // 3. Check file connectivity (parallel for speed) & accumulate total size
        const files = [
            this.sofficeWasmFile,
            this.sofficeDataFile,
            'soffice.js',
            'soffice.worker.js',
            'browser.worker.global.js',
        ];
        let totalBytes = 0;
        await Promise.all(files.map(async (file) => {
            const url = `${this.basePath}${file}?v=${ASSET_VERSION}`;
            try {
                const start = performance.now();
                // Check for the file itself or its chunk manifest
                let res = await fetch(url, { method: 'HEAD' });
                
                if (!res.ok) {
                    const manifestUrl = `${this.basePath}${file}.manifest.json?v=${ASSET_VERSION}`;
                    const mRes = await fetch(manifestUrl, { method: 'HEAD' });
                    if (mRes.ok) {
                        res = mRes;
                        console.warn(`[LibreOffice] ${file}: Found chunk manifest instead of raw file.`);
                    }
                }

                const duration = Math.round(performance.now() - start);

                if (res.ok) {
                    const size = res.headers.get('content-length');
                    const type = res.headers.get('content-type');
                    // Note: manifest size is small, so totalAssetSizeMB will be undercounted 
                    // if files are chunked, but that's acceptable for an environment check.
                    const sizeNum = size ? parseInt(size) : 0;
                    if (sizeNum > 0) totalBytes += sizeNum;
                    const sizeMb = sizeNum > 0 ? (sizeNum / 1024 / 1024).toFixed(2) + 'MB' : 'unknown size';
                    console.warn(
                        `[LibreOffice] ${file}: OK (${res.status}) ${duration}ms | ${sizeMb} | type=${type}`
                    );
                } else {
                    console.error(`[LibreOffice] ${file}: FAILED (${res.status} ${res.statusText})`);
                    throw new Error(`Required file ${file} returned HTTP ${res.status}`);
                }
            } catch (e) {
                if (e instanceof Error && e.message.startsWith('Required file')) throw e;
                console.error(`[LibreOffice] ${file}: NETWORK ERROR`, e);
                throw new Error(`Cannot fetch ${file}: ${e}`);
            }
        }));

        this.totalAssetSizeMB = totalBytes / (1024 * 1024);
        if (this.totalAssetSizeMB > 0) {
            console.warn(`[LibreOffice] Total asset size: ${this.totalAssetSizeMB.toFixed(1)} MB`);
        }
        console.warn('[LibreOffice] === Environment Check Passed ✅ ===');
    }

    isReady(): boolean {
        return this.initialized && this.converter !== null;
    }

    async convert(file: File, outputFormat: string): Promise<Blob> {
        if (!this.converter) {
            throw new Error('Converter not initialized');
        }

        console.log(`[LibreOffice] Converting ${file.name} to ${outputFormat}...`);
        console.log(`[LibreOffice] File type: ${file.type}, Size: ${file.size} bytes`);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const ext = file.name.split('.').pop()?.toLowerCase() || '';

            console.log(`[LibreOffice] Detected format from extension: ${ext}`);

            const startTime = Date.now();
            const result = await this.converter.convert(uint8Array, {
                outputFormat: outputFormat as any,
                inputFormat: ext as any,
            }, file.name);

            const duration = Date.now() - startTime;
            console.log(`[LibreOffice] Conversion complete! Duration: ${duration}ms, Size: ${result.data.length} bytes`);

            // SharedArrayBuffer-backed data cannot be passed to Blob directly;
            // copy only when necessary to avoid unnecessary allocation.
            const isSAB = typeof SharedArrayBuffer !== 'undefined'
                && result.data.buffer instanceof SharedArrayBuffer;
            const outputData = isSAB
                ? new Uint8Array(result.data) // copies into a regular ArrayBuffer
                : result.data;
            return new Blob([outputData as BlobPart], { type: result.mimeType });
        } catch (error) {
            console.error(`[LibreOffice] Conversion FAILED for ${file.name}:`, error);
            throw error;
        }
    }

    async convertToPdf(file: File): Promise<Blob> {
        return this.convert(file, 'pdf');
    }

    async wordToPdf(file: File): Promise<Blob> {
        return this.convertToPdf(file);
    }

    async pptToPdf(file: File): Promise<Blob> {
        return this.convertToPdf(file);
    }

    async excelToPdf(file: File): Promise<Blob> {
        return this.convertToPdf(file);
    }

    async destroy(): Promise<void> {
        if (this.converter) {
            await this.converter.destroy();
        }
        
        // Revoke Blob URLs to release memory
        this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        this.blobUrls = [];
        
        this.converter = null;
        this.initialized = false;
    }
}

export function getLibreOfficeConverter(basePath?: string): LibreOfficeConverter {
    if (!converterInstance) {
        converterInstance = new LibreOfficeConverter(basePath);
    }
    return converterInstance;
}
