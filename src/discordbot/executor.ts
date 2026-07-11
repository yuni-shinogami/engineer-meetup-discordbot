import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runScript(scriptPath: string, args: string[] = []): Promise<string> {
  if (!scriptPath) {
    throw new Error('Script path is not configured.');
  }

  const command = `${scriptPath} ${args.join(' ')}`;
  console.log(`Executing: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.warn(`Script stderr: ${stderr}`);
    }
    return stdout.trim();
  } catch (error) {
    console.error(`Script execution failed: ${error}`);
    throw error;
  }
}
