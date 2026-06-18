'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { UploadCloud, File, Plus, X } from 'lucide-react';
import { trackFileUploaded } from '@/lib/analytics';
import { useToolContext } from '@/lib/contexts/ToolContext';

export interface FileUploaderProps {
  /** Accepted file types (MIME types or extensions) */
  accept?: string[];
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Callback when files are selected */
  onFilesSelected: (files: File[]) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Custom class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom label text */
  label?: string;
  /** Custom description text */
  description?: string;
}

/**
 * FileUploader Component
 * Requirements: 5.2
 * 
 * Supports drag-and-drop, file picker, and paste from clipboard.
 * Beautified with premium UI and glassmorphism.
 */
export const FileUploader: React.FC<FileUploaderProps> = ({
  accept = ['application/pdf'],
  multiple = false,
  maxSize = Infinity, // No limit by default
  maxFiles = 10,
  onFilesSelected,
  onError,
  className = '',
  disabled = false,
  label,
  description,
}) => {
  const t = useTranslations('common');
  const tErrors = useTranslations('errors');
  const toolContext = useToolContext();
  const toolName = toolContext?.toolName ?? 'unknown';

  // Encryption & Decryption states
  const [encryptPendingFiles, setEncryptPendingFiles] = useState<File[]>([]);
  const [encryptCurrentIndex, setEncryptCurrentIndex] = useState<number>(-1);
  const [password, setPassword] = useState<string>('');
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [shouldShake, setShouldShake] = useState<boolean>(false);
  const [decryptedFilesAccumulator, setDecryptedFilesAccumulator] = useState<File[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Helper to check if a PDF file is encrypted
  const checkIsEncrypted = async (file: File): Promise<boolean> => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return false;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { PDFDocument } = await import('pdf-lib');
      await PDFDocument.load(arrayBuffer);
      return false;
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('encrypt') || msg.includes('password') || msg.includes('decrypt')) {
        return true;
      }
      return false;
    }
  };

  const resetDecryptStates = () => {
    setEncryptPendingFiles([]);
    setEncryptCurrentIndex(-1);
    setPassword('');
    setDecryptError(null);
    setIsDecrypting(false);
    setDecryptedFilesAccumulator([]);
  };

  const handleDecryptCancel = () => {
    resetDecryptStates();
  };

  // Generate accept string for input element
  const acceptString = accept.join(',');

  // Derive a reasonable default label for the "Select" button.
  // Many tools reuse FileUploader for non-PDF inputs (images, docs, etc.), so
  // avoid misleading copy like "Select PDF" when images are expected.
  const selectButtonText = (() => {
    const imageExts = new Set([
      '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.svg', '.heic', '.heif'
    ]);
    const lower = (accept || []).map((t) => t.toLowerCase());

    const acceptsOnlyPdf = lower.length > 0 && lower.every((t) => t === 'application/pdf' || t === '.pdf');
    const acceptsOnlyImages = lower.length > 0 && lower.every((t) => t.startsWith('image/') || imageExts.has(t));

    if (acceptsOnlyImages) return multiple ? 'Select Images' : 'Select Image';
    if (acceptsOnlyPdf) return 'Select PDF';
    return multiple ? 'Select Files' : 'Select File';
  })();

  /**
   * Validate files against constraints
   */
  const validateFiles = useCallback((files: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    // Check max files
    if (!multiple && files.length > 1) {
      errors.push('Only one file can be uploaded at a time.');
      return { valid: [files[0]], errors };
    }

    if (files.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} files allowed.`);
      files = files.slice(0, maxFiles);
    }

    for (const file of files) {
      // Check file size (skip if no limit)
      if (maxSize !== Infinity && file.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        errors.push(tErrors('fileTooLarge', { maxSize: maxSizeMB }));
        continue;
      }

      // Check file type
      const isValidType = accept.some(type => {
        // Accept all files
        if (type === '*/*' || type === '*') {
          return true;
        }
        if (type.startsWith('.')) {
          // Extension check
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        if (type.endsWith('/*')) {
          // Wildcard MIME type
          const baseType = type.slice(0, -2);
          return file.type.startsWith(baseType);
        }
        // Exact MIME type match
        return file.type === type;
      });

      // Also check by extension for PDF files
      const isPdfByExtension = file.name.toLowerCase().endsWith('.pdf');
      const acceptsPdf = accept.includes('application/pdf');

      if (!isValidType && !(acceptsPdf && isPdfByExtension)) {
        errors.push(tErrors('fileTypeInvalid', { acceptedTypes: accept.join(', ') }));
        continue;
      }

      valid.push(file);
    }

    return { valid, errors };
  }, [accept, maxSize, maxFiles, multiple, tErrors]);

  /**
   * Handle decryption submit action
   */
  const handleDecryptSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isDecrypting || encryptCurrentIndex === -1) return;

    const fileToDecrypt = encryptPendingFiles[encryptCurrentIndex];
    setIsDecrypting(true);
    setDecryptError(null);

    try {
      const arrayBuffer = await fileToDecrypt.arrayBuffer();
      const { PDFDocument } = await import('pdf-lib');

      // Attempt to load with the user-provided password (cast to any for compiler compatibility)
      const pdfDoc = await PDFDocument.load(arrayBuffer, { password } as any);

      // Save as completely decrypted (without any password protection)
      const decryptedBytes = await pdfDoc.save();
      const decryptedBlob = new Blob([decryptedBytes as any], { type: 'application/pdf' });

      // Create a fresh unlocked virtual File object, fallback to window.File to avoid Node/Browser File type clashes
      const unlockedFile = new (window as any).File([decryptedBlob], fileToDecrypt.name.replace('.pdf', '_unlocked.pdf'), {
        type: 'application/pdf',
      }) as File;

      const updatedAccumulator = [...decryptedFilesAccumulator, unlockedFile];
      setDecryptedFilesAccumulator(updatedAccumulator);
      setPassword('');

      const nextIndex = encryptCurrentIndex + 1;
      if (nextIndex < encryptPendingFiles.length) {
        setEncryptCurrentIndex(nextIndex);
      } else {
        // Complete! Notify tool components of the unlocked files alongside native plain files
        onFilesSelected(updatedAccumulator);
        resetDecryptStates();
      }
    } catch (err: any) {
      console.error('PDF Decryption failed:', err);
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
      setDecryptError(tErrors('incorrectPassword') || 'Incorrect password. Please try again.');
    } finally {
      setIsDecrypting(false);
    }
  };

  /**
   * Handle file selection
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled) return;

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const { valid, errors } = validateFiles(fileArray);

    if (errors.length > 0 && onError) {
      onError(errors[0]);
    }

    if (valid.length > 0) {
      onFilesSelected(valid);
      // Track upload — file names are never sent, only type/size/count
      try {
        const first = valid[0];
        trackFileUploaded({
          toolName: toolName || 'unknown',
          fileType: first.type || 'application/octet-stream',
          fileSize: valid.reduce((sum, f) => sum + f.size, 0),
          fileCount: valid.length,
        });
      } catch { /* analytics must never block the user */ }
    }
  }, [disabled, validateFiles, onError, onFilesSelected, toolName]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }

    setDragCounter(prev => prev + 1);
    const hasFiles = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles || (e.dataTransfer.items && e.dataTransfer.items.length > 0)) {
      setIsDragging(true);
    }
  }, [disabled]);

  /**
   * Handle drag leave
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  /**
   * Handle drop
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    setDragCounter(0);

    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFiles(files);
  }, [disabled, handleFiles]);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  }, [handleFiles]);

  /**
   * Handle click to open file picker
   */
  const handleClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  /**
   * Handle keyboard interaction
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, [disabled]);

  /**
   * Handle Tauri native drag-and-drop events
   */
  useEffect(() => {
    if (!isTauri() || disabled) return;

    let active = true;
    const unlisteners: (() => void)[] = [];

    const setupTauriDragDrop = async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const appWindow = getCurrentWebviewWindow();

        if (!active) return;

        const uOver = await appWindow.listen<{ paths: string[] }>('tauri://drag-over', () => {
          setIsDragging(true);
        });
        unlisteners.push(uOver);

        const uLeave = await appWindow.listen('tauri://drag-leave', () => {
          setIsDragging(false);
        });
        unlisteners.push(uLeave);

        const uDrop = await appWindow.listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
          setIsDragging(false);
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;

          const fileObjects: File[] = [];
          for (const filePath of paths) {
            try {
              const bytes = await readFile(filePath);
              const name = filePath.split(/[/\\]/).pop() || 'file.pdf';
              
              let mimeType = 'application/octet-stream';
              if (name.toLowerCase().endsWith('.pdf')) {
                mimeType = 'application/pdf';
              } else if (name.toLowerCase().endsWith('.png')) {
                mimeType = 'image/png';
              } else if (name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg')) {
                mimeType = 'image/jpeg';
              }

              const file = new (window as any).File([bytes], name, { type: mimeType }) as File;
              fileObjects.push(file);
            } catch (err) {
              console.error(`Tauri failed to read dragged file: ${filePath}`, err);
            }
          }

          if (fileObjects.length > 0) {
            handleFiles(fileObjects);
          }
        });
        unlisteners.push(uDrop);

        if (!active) {
          unlisteners.forEach(u => u());
        }
      } catch (err) {
        console.error('Failed to set up Tauri drag and drop listeners:', err);
      }
    };

    setupTauriDragDrop();

    return () => {
      active = false;
      unlisteners.forEach(u => u());
    };
  }, [disabled, handleFiles]);

  /**
   * Handle paste from clipboard
   */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [disabled, handleFiles]);

  /**
   * Prevent default browser drag/drop behavior to avoid file navigation (only for file drags)
   */
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      const hasFiles = e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
      if (hasFiles) {
        e.preventDefault();
      }
    };
    
    const handleGlobalDrop = (e: DragEvent) => {
      const hasFiles = e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
      if (hasFiles) {
        e.preventDefault();
      }
    };

    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  const baseStyles = `
    relative flex flex-col items-center justify-center
    w-full min-h-[220px] p-8
    border-2 border-dashed
    rounded-2xl
    transition-all duration-200
    cursor-pointer
    group
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary))/0.5]
  `;

  const stateStyles = disabled
    ? 'border-[hsl(var(--color-muted))] bg-[hsl(var(--color-muted)/0.3)] cursor-not-allowed opacity-50'
    : isDragging
      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.04)]'
      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] hover:border-[hsl(var(--color-primary)/0.6)] hover:bg-[hsl(var(--color-muted)/0.3)]';

  return (
    <div
      ref={dropZoneRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label || t('buttons.upload')}
      aria-disabled={disabled}
      data-testid="file-uploader"
      className={`${baseStyles} ${stateStyles} ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptString}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        data-testid="file-input"
        disabled={disabled}
      />

      {/* Upload icon */}
      <div className={`mb-4 transition-colors duration-200 ${isDragging ? 'text-[hsl(var(--color-primary))]' : 'text-[hsl(var(--color-muted-foreground))] group-hover:text-[hsl(var(--color-primary))]'}`}>
        <UploadCloud className="w-9 h-9" aria-hidden="true" />
      </div>

      {/* Label */}
      <p className="text-base font-semibold text-[hsl(var(--color-foreground))] mb-1.5 text-center">
        {label || 'Drag and drop files here or click to browse'}
      </p>

      {/* Description / size hint */}
      <p className="text-xs text-[hsl(var(--color-muted-foreground))] text-center mb-2">
        {description || (
          maxSize !== Infinity
            ? `Up to ${Math.round(maxSize / 1024 / 1024)}MB · ${multiple ? 'Multiple files' : 'Single file'}`
            : (multiple ? 'Multiple files' : 'Single file')
        )}
      </p>

      {/* File type info */}
      {accept && accept.length > 0 && (
        <p className="text-xs text-[hsl(var(--color-muted-foreground))] text-center mb-1">
          {accept.join(', ')}
        </p>
      )}

      {/* Max files info */}
      {multiple && maxFiles && (
        <p className="text-xs text-[hsl(var(--color-muted-foreground))] text-center mb-4">
          Max files: {maxFiles}
        </p>
      )}

      {/* Select button */}
      <button
        type="button"
        onClick={(e) => {
          // Prevent bubbling to the parent dropzone onClick.
          // Double-triggering input.click() can cause the chooser to immediately close or be ignored.
          e.preventDefault();
          e.stopPropagation();
          handleClick();
        }}
        disabled={disabled}
        className="px-5 py-2 text-sm font-semibold text-white bg-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary-hover))] rounded-lg transition-colors shadow-sm disabled:opacity-50"
        tabIndex={-1}
        aria-hidden="true"
      >
        {selectButtonText}
      </button>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[hsl(var(--color-primary)/0.06)] rounded-2xl z-10 pointer-events-none">
          <Plus className="w-8 h-8 text-[hsl(var(--color-primary))] mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-[hsl(var(--color-primary))]">
            Drop files here
          </p>
        </div>
      )}

      {/* Decryption Password Prompt Modal */}
      {encryptCurrentIndex !== -1 && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {/* Custom shake keyframe injection */}
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
              20%, 40%, 60%, 80% { transform: translateX(6px); }
            }
            .modal-shake {
              animation: shake 0.5s ease-in-out;
            }
          `}</style>
          
          <div 
            className={`bg-[hsl(var(--color-card))] border border-white/10 dark:border-zinc-800/40 p-6 rounded-[2rem] max-w-sm w-full shadow-2xl mx-4 transition-all duration-300 transform scale-100 ${
              shouldShake ? 'modal-shake' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div className="flex flex-col items-center text-center">
              {/* Lock Circle Icon */}
              <div className="p-4 rounded-full bg-red-500/10 text-red-500 mb-4 animate-pulse">
                <Lock className="w-8 h-8" />
              </div>
              
              <h3 className="text-lg font-bold text-[hsl(var(--color-foreground))] mb-1">
                {t('fileUploader.encryptedTitle')}
              </h3>
              
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mb-4 max-w-[280px] break-all leading-relaxed">
                {t('fileUploader.enterPasswordHelp')}
                <span className="font-semibold text-[hsl(var(--color-foreground))]">{encryptPendingFiles[encryptCurrentIndex]?.name}</span>
              </p>
              
              {/* Form */}
              <form 
                onSubmit={handleDecryptSubmit} 
                className="w-full space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative flex items-center">
                  <input
                    type="password"
                    placeholder={t('fileUploader.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    disabled={isDecrypting}
                    className="w-full px-4 py-2.5 rounded-[var(--radius-md)] bg-[hsl(var(--color-muted)/0.4)] border border-[hsl(var(--color-input))] text-sm text-[hsl(var(--color-foreground))] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] focus:border-transparent transition-all"
                  />
                </div>
                
                {decryptError && (
                  <p className="text-xs text-red-500 font-semibold animate-in fade-in">
                    {decryptError}
                  </p>
                )}
                
                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleDecryptCancel}
                    disabled={isDecrypting}
                    className="flex-1 px-4 py-2 text-xs font-semibold rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))] transition-colors disabled:opacity-50"
                  >
                    {t('fileUploader.cancelButton')}
                  </button>
                  <button
                    type="submit"
                    disabled={isDecrypting || !password}
                    className="flex-1 px-4 py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary-hover))] text-[hsl(var(--color-primary-foreground))] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDecrypting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('fileUploader.decrypting')}
                      </>
                    ) : (
                      t('fileUploader.decryptAndContinue')
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
