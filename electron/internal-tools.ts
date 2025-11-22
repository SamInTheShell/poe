import { readFile, writeFile, mkdir, readdir, stat, rename, rm } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute, resolve, sep } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

const execAsync = promisify(exec);

/**
 * Validates and resolves a path to ensure it's within the project directory.
 * Path must start with / to be relative to project root.
 */
function resolveProjectPath(inputPath: string, projectRoot: string): string {
  // Ensure path starts with /
  if (!inputPath.startsWith('/')) {
    throw new Error(`Path must start with / (representing project root). Got: ${inputPath}`);
  }

  // Remove leading / and resolve relative to project root
  const relativePath = inputPath.substring(1);
  const absolutePath = resolve(projectRoot, relativePath);

  // Ensure the resolved path is still within projectRoot
  const relativeToRoot = relative(projectRoot, absolutePath);
  if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
    throw new Error(`Path is outside project directory: ${inputPath}`);
  }

  return absolutePath;
}

/**
 * Converts absolute path back to project-relative path (with leading /)
 */
function toProjectPath(absolutePath: string, projectRoot: string): string {
  const rel = relative(projectRoot, absolutePath);
  return '/' + rel.replace(/\\/g, '/');
}

export interface ReadParams {
  projectPath: string;
  file_path: string;
  offset?: number;
  limit?: number;
}

export async function handleRead(params: ReadParams) {
  try {
    const absolutePath = resolveProjectPath(params.file_path, params.projectPath);

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${params.file_path}`,
      };
    }

    const content = await readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');

    const offset = params.offset || 0;
    const limit = params.limit || lines.length;

    const selectedLines = lines.slice(offset, offset + limit);

    // Format with line numbers like cat -n
    const numberedLines = selectedLines.map((line, idx) => {
      const lineNum = offset + idx + 1;
      return `${lineNum.toString().padStart(6, ' ')}\t${line}`;
    }).join('\n');

    return {
      success: true,
      content: numberedLines,
      total_lines: lines.length,
      lines_returned: selectedLines.length,
      offset,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface WriteParams {
  projectPath: string;
  file_path: string;
  content: string;
}

export async function handleWrite(params: WriteParams) {
  try {
    const absolutePath = resolveProjectPath(params.file_path, params.projectPath);

    // Read old content if file exists (for diff display)
    let oldContent: string | null = null;
    if (existsSync(absolutePath)) {
      try {
        oldContent = await readFile(absolutePath, 'utf-8');
      } catch {
        // If we can't read the old file, just continue
        oldContent = null;
      }
    }

    // Create directory if it doesn't exist
    const dir = dirname(absolutePath);
    await mkdir(dir, { recursive: true });

    await writeFile(absolutePath, params.content, 'utf-8');

    return {
      success: true,
      file_path: params.file_path,
      bytes_written: Buffer.from(params.content).length,
      old_content: oldContent,
      new_content: params.content,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface EditParams {
  projectPath: string;
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export async function handleEdit(params: EditParams) {
  try {
    const absolutePath = resolveProjectPath(params.file_path, params.projectPath);

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${params.file_path}`,
      };
    }

    const content = await readFile(absolutePath, 'utf-8');

    // Count occurrences
    const regex = new RegExp(params.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    const occurrences = matches ? matches.length : 0;

    if (occurrences === 0) {
      return {
        success: false,
        error: `String not found in file: ${params.old_string.substring(0, 50)}${params.old_string.length > 50 ? '...' : ''}`,
      };
    }

    if (!params.replace_all && occurrences > 1) {
      return {
        success: false,
        error: `Found ${occurrences} occurrences. String must be unique or use replace_all: true`,
      };
    }

    const newContent = params.replace_all
      ? content.replace(regex, params.new_string)
      : content.replace(params.old_string, params.new_string);

    await writeFile(absolutePath, newContent, 'utf-8');

    return {
      success: true,
      file_path: params.file_path,
      replacements: occurrences,
      old_content: content,
      new_content: newContent,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface GlobParams {
  projectPath: string;
  pattern: string;
  path?: string;
}

/**
 * Simple fuzzy matching: checks if all characters in pattern appear in order in the text
 */
function fuzzyMatch(pattern: string, text: string): boolean {
  if (!pattern) return true;
  const lowerPattern = pattern.toLowerCase();
  const lowerText = text.toLowerCase();
  
  let patternIndex = 0;
  for (let i = 0; i < lowerText.length && patternIndex < lowerPattern.length; i++) {
    if (lowerText[i] === lowerPattern[patternIndex]) {
      patternIndex++;
    }
  }
  return patternIndex === lowerPattern.length;
}

/**
 * Recursively walk directory and collect all files
 */
async function walkDirectory(
  dirPath: string,
  projectRoot: string,
  ignoreDirs: Set<string>,
  maxDepth: number = 50,
  currentDepth: number = 0
): Promise<string[]> {
  if (currentDepth > maxDepth) return [];
  
  const files: string[] = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      // Ensure we don't go above project root - normalize paths for comparison
      const normalizedFullPath = resolve(fullPath);
      const normalizedProjectRoot = resolve(projectRoot);
      
      // Use path comparison that works cross-platform
      if (!normalizedFullPath.startsWith(normalizedProjectRoot + sep) && 
          normalizedFullPath !== normalizedProjectRoot) {
        continue;
      }
      
      const relativePath = relative(projectRoot, fullPath);
      
      // Double-check: relative path should not go outside project root
      if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        continue;
      }
      
      // Skip ignored directories
      if (entry.isDirectory()) {
        const dirName = entry.name.toLowerCase();
        if (ignoreDirs.has(dirName)) {
          continue;
        }
        // Recursively walk subdirectories
        const subFiles = await walkDirectory(fullPath, projectRoot, ignoreDirs, maxDepth, currentDepth + 1);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore permission errors and continue
    if (error instanceof Error && !error.message.includes('ENOENT')) {
      console.warn(`[walkDirectory] Error reading ${dirPath}:`, error.message);
    }
  }
  
  return files;
}

export async function handleGlob(params: GlobParams) {
  try {
    const searchPath = params.path ? resolveProjectPath(params.path, params.projectPath) : params.projectPath;

    if (!params.pattern) {
      return {
        success: false,
        error: 'Pattern parameter is required',
      };
    }

    // Ignore common directories
    const ignoreDirs = new Set(['node_modules', '.git', '.vscode', '.idea', 'dist', 'build', '.next', '.cache']);
    
    // Walk directory to get all files
    const allFiles = await walkDirectory(searchPath, params.projectPath, ignoreDirs);
    
    // Convert to project-relative paths
    const projectRelativeFiles = allFiles.map(f => toProjectPath(f, params.projectPath));
    
    // Filter files based on pattern
    let matchedFiles: string[] = [];
    
    // Check if pattern is a regex (starts and ends with /)
    const regexMatch = params.pattern.match(/^\/(.+)\/([gimuy]*)$/);
    
    if (regexMatch) {
      // Use regex matching
      try {
        const regex = new RegExp(regexMatch[1], regexMatch[2] || '');
        matchedFiles = projectRelativeFiles.filter(file => {
          // Match against the file path (with or without leading slash)
          const pathToMatch = file.startsWith('/') ? file.slice(1) : file;
          return regex.test(pathToMatch) || regex.test(file);
        });
      } catch (error) {
        return {
          success: false,
          error: `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    } else {
      // Use fuzzy matching
      // Also support simple glob-like patterns: *.ext, **/*.ext, etc.
      const pattern = params.pattern;
      
      // Convert glob-like patterns to regex-like matching
      if (pattern.includes('*') || pattern.includes('?')) {
        // Simple glob pattern support
        const globRegex = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '___DOUBLE_STAR___')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]')
          .replace(/___DOUBLE_STAR___/g, '.*');
        
        const regex = new RegExp(`^${globRegex}$`, 'i');
        matchedFiles = projectRelativeFiles.filter(file => {
          const pathToMatch = file.startsWith('/') ? file.slice(1) : file;
          return regex.test(pathToMatch) || regex.test(file);
        });
      } else {
        // Fuzzy match
        matchedFiles = projectRelativeFiles.filter(file => {
          const pathToMatch = file.startsWith('/') ? file.slice(1) : file;
          return fuzzyMatch(pattern, pathToMatch) || fuzzyMatch(pattern, file);
        });
      }
    }

    return {
      success: true,
      files: matchedFiles,
      count: matchedFiles.length,
    };
  } catch (error) {
    console.error('[handleGlob] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface GrepParams {
  projectPath: string;
  pattern: string;
  path?: string;
  glob?: string;
  case_insensitive?: boolean;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  context_before?: number;
  context_after?: number;
}

export async function handleGrep(params: GrepParams) {
  try {
    const searchPath = params.path ? resolveProjectPath(params.path, params.projectPath) : params.projectPath;
    const outputMode = params.output_mode || 'files_with_matches';

    // Build ripgrep/grep command
    const args: string[] = [];

    // Pattern
    if (params.case_insensitive) {
      args.push('-i');
    }

    // Output mode
    if (outputMode === 'files_with_matches') {
      args.push('-l');
    } else if (outputMode === 'count') {
      args.push('-c');
    } else if (outputMode === 'content') {
      args.push('-n'); // Show line numbers
      if (params.context_before) {
        args.push(`-B ${params.context_before}`);
      }
      if (params.context_after) {
        args.push(`-A ${params.context_after}`);
      }
    }

    // Glob pattern
    if (params.glob) {
      args.push(`--glob '${params.glob}'`);
    }

    // Exclude common directories
    args.push("--glob '!node_modules/**'");
    args.push("--glob '!.git/**'");

    const grepCommand = `rg ${args.join(' ')} '${params.pattern}' '${searchPath}'`;

    try {
      const { stdout } = await execAsync(grepCommand);

      if (outputMode === 'files_with_matches') {
        const files = stdout.trim().split('\n').filter(Boolean).map(f => toProjectPath(f, params.projectPath));
        return {
          success: true,
          files,
          count: files.length,
        };
      } else if (outputMode === 'count') {
        return {
          success: true,
          content: stdout,
        };
      } else {
        return {
          success: true,
          content: stdout,
        };
      }
    } catch (execError: any) {
      // Exit code 1 means no matches found
      if (execError.code === 1) {
        return {
          success: true,
          files: [],
          count: 0,
          content: '',
        };
      }
      throw execError;
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface BashParams {
  projectPath: string;
  command: string;
  description?: string;
  timeout?: number;
}

export async function handleBash(params: BashParams) {
  try {
    const timeout = Math.min(params.timeout || 120000, 600000); // Default 2 min, max 10 min

    const { stdout, stderr } = await execAsync(params.command, {
      cwd: params.projectPath,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return {
      success: true,
      stdout: stdout || '',
      stderr: stderr || '',
      command: params.command,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      command: params.command,
      exit_code: error.code,
    };
  }
}

export interface LsParams {
  projectPath: string;
  path?: string;
  show_hidden?: boolean;
  long_format?: boolean;
}

export async function handleLs(params: LsParams) {
  try {
    const dirPath = params.path ? resolveProjectPath(params.path, params.projectPath) : params.projectPath;

    if (!existsSync(dirPath)) {
      return {
        success: false,
        error: `Directory not found: ${params.path || '/'}`,
      };
    }

    const dirStat = await stat(dirPath);
    if (!dirStat.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${params.path || '/'}`,
      };
    }

    let entries = await readdir(dirPath);

    // Filter hidden files unless requested
    if (!params.show_hidden) {
      entries = entries.filter(name => !name.startsWith('.'));
    }

    // Sort entries
    entries.sort();

    if (params.long_format) {
      // Get detailed info for each entry
      const detailedEntries = await Promise.all(
        entries.map(async (name) => {
          const fullPath = join(dirPath, name);
          const stats = await stat(fullPath);
          return {
            name,
            type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        })
      );

      return {
        success: true,
        path: params.path || '/',
        entries: detailedEntries,
        count: detailedEntries.length,
      };
    } else {
      // Simple list
      return {
        success: true,
        path: params.path || '/',
        entries: entries,
        count: entries.length,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface MoveParams {
  projectPath: string;
  source_path: string;
  destination_path: string;
}

export async function handleMove(params: MoveParams) {
  try {
    const sourcePath = resolveProjectPath(params.source_path, params.projectPath);
    const destPath = resolveProjectPath(params.destination_path, params.projectPath);

    if (!existsSync(sourcePath)) {
      return {
        success: false,
        error: `Source not found: ${params.source_path}`,
      };
    }

    // Check if destination already exists
    if (existsSync(destPath)) {
      return {
        success: false,
        error: `Destination already exists: ${params.destination_path}`,
      };
    }

    // Ensure destination directory exists
    const destDir = dirname(destPath);
    await mkdir(destDir, { recursive: true });

    // Move the file or directory
    await rename(sourcePath, destPath);

    const sourceStats = await stat(destPath);
    const type = sourceStats.isDirectory() ? 'directory' : 'file';

    return {
      success: true,
      source_path: params.source_path,
      destination_path: params.destination_path,
      type,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface RmParams {
  projectPath: string;
  path: string;
  recursive?: boolean;
}

export async function handleRm(params: RmParams) {
  try {
    const absolutePath = resolveProjectPath(params.path, params.projectPath);

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `Path not found: ${params.path}`,
      };
    }

    const pathStats = await stat(absolutePath);
    const isDirectory = pathStats.isDirectory();

    // Safety check: don't allow deleting the project root
    if (absolutePath === params.projectPath) {
      return {
        success: false,
        error: 'Cannot delete the project root directory',
      };
    }

    // For directories, require recursive flag
    if (isDirectory && !params.recursive) {
      const entries = await readdir(absolutePath);
      if (entries.length > 0) {
        return {
          success: false,
          error: 'Directory is not empty. Use recursive: true to delete non-empty directories',
        };
      }
    }

    // Delete the file or directory
    await rm(absolutePath, { recursive: params.recursive || false, force: false });

    return {
      success: true,
      path: params.path,
      type: isDirectory ? 'directory' : 'file',
      recursive: params.recursive || false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface MkdirParams {
  projectPath: string;
  path: string;
}

export async function handleMkdir(params: MkdirParams) {
  try {
    const absolutePath = resolveProjectPath(params.path, params.projectPath);

    if (existsSync(absolutePath)) {
      const pathStats = await stat(absolutePath);
      if (pathStats.isDirectory()) {
        return {
          success: false,
          error: `Directory already exists: ${params.path}`,
        };
      } else {
        return {
          success: false,
          error: `A file already exists at this path: ${params.path}`,
        };
      }
    }

    // Create directory with recursive option (creates parent directories if needed)
    await mkdir(absolutePath, { recursive: true });

    return {
      success: true,
      path: params.path,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
