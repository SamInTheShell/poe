/**
 * Utility for generating diff preview data for write/edit tool calls
 */

interface PreviewData {
  old_content: string | null;
  new_content: string;
  file_path: string;
}

/**
 * Parse numbered lines from tool read result to get just the content
 */
const parseNumberedLines = (content: string): string => {
  const lines = content.split('\n').map(line => {
    // Remove line numbers (format: "     1\tcontent")
    const tabIndex = line.indexOf('\t');
    return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
  });
  return lines.join('\n');
};

/**
 * Generate preview data for a write tool call
 */
export const generateWritePreviewData = async (
  args: { file_path: string; content: string },
  workingDirectory: string
): Promise<PreviewData | undefined> => {
  try {
    const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
      file_path: args.file_path,
    });

    if (readResult.success && readResult.content) {
      return {
        old_content: parseNumberedLines(readResult.content),
        new_content: args.content,
        file_path: args.file_path,
      };
    } else {
      // New file - no old content
      return {
        old_content: null,
        new_content: args.content,
        file_path: args.file_path,
      };
    }
  } catch (error) {
    console.error('Failed to read file for preview:', error);
    // New file or error - no old content
    return {
      old_content: null,
      new_content: args.content,
      file_path: args.file_path,
    };
  }
};

/**
 * Generate preview data for an edit tool call
 */
export const generateEditPreviewData = async (
  args: { file_path: string; old_string: string; new_string: string; replace_all?: boolean },
  workingDirectory: string
): Promise<PreviewData | undefined> => {
  try {
    const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
      file_path: args.file_path,
    });

    if (readResult.success && readResult.content) {
      const oldContent = parseNumberedLines(readResult.content);

      // Apply the edit to show preview
      const newContent = args.replace_all
        ? oldContent.replace(
            new RegExp((args.old_string as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            args.new_string as string
          )
        : oldContent.replace(args.old_string as string, args.new_string as string);

      return {
        old_content: oldContent,
        new_content: newContent,
        file_path: args.file_path,
      };
    }
  } catch (error) {
    console.error('Failed to read file for edit preview:', error);
  }

  return undefined;
};

/**
 * Generate preview data for any tool call that supports it
 */
export const generatePreviewData = async (
  toolName: string,
  args: any,
  workingDirectory: string
): Promise<any> => {
  if (toolName === 'write' && args.file_path) {
    return generateWritePreviewData(args, workingDirectory);
  } else if (toolName === 'edit' && args.file_path) {
    return generateEditPreviewData(args, workingDirectory);
  }
  return undefined;
};
