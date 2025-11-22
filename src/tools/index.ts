import { toolRegistry } from './ToolRegistry';
import { ReadTool } from './tools/ReadTool';
import { WriteTool } from './tools/WriteTool';
import { EditTool } from './tools/EditTool';
import { GlobTool } from './tools/GlobTool';
import { GrepTool } from './tools/GrepTool';
import { BashTool } from './tools/BashTool';
import { LsTool } from './tools/LsTool';
import { MoveTool } from './tools/MoveTool';
import { RmTool } from './tools/RmTool';
import { MkdirTool } from './tools/MkdirTool';

// Register all tools
export function initializeTools() {
  // Internal coding tools
  toolRegistry.register(ReadTool);
  toolRegistry.register(WriteTool);
  toolRegistry.register(EditTool);
  toolRegistry.register(GlobTool);
  toolRegistry.register(GrepTool);
  toolRegistry.register(BashTool);
  toolRegistry.register(LsTool);

  // File system operations (require permission by default)
  toolRegistry.register(MoveTool);
  toolRegistry.register(RmTool);
  toolRegistry.register(MkdirTool);
}

export { toolRegistry };
