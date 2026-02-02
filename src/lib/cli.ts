/**
 * CLI helper utilities.
 * Provides consistent argument parsing and help output for all scripts.
 * @module lib/cli
 */

export interface CliOption {
  name: string;
  short?: string;
  description: string;
  default?: string;
  required?: boolean;
}

export interface CliConfig {
  name: string;
  description: string;
  usage?: string;
  options: CliOption[];
  examples?: string[];
}

/**
 * Parse command line arguments into an object.
 * Supports --flag, --key=value, and --key value formats.
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      
      // Handle --key=value format
      if (key.includes('=')) {
        const [k, v] = key.split('=');
        args[k] = v;
      } 
      // Handle --key value format
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args[key] = argv[++i];
      } 
      // Handle --flag (boolean)
      else {
        args[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Handle -k value short format
      const key = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  
  return args;
}

/**
 * Check if help was requested via --help or -h.
 */
export function wantsHelp(args: Record<string, string | boolean>): boolean {
  return args.help === true || args.h === true;
}

/**
 * Print help text for a CLI command.
 */
export function printHelp(config: CliConfig): void {
  console.log(`\n${config.name}`);
  console.log('─'.repeat(50));
  console.log(config.description);
  
  if (config.usage) {
    console.log(`\nUsage: ${config.usage}`);
  }
  
  console.log('\nOptions:');
  for (const opt of config.options) {
    const short = opt.short ? `-${opt.short}, ` : '    ';
    const name = `--${opt.name}`.padEnd(20);
    const def = opt.default ? ` (default: ${opt.default})` : '';
    const req = opt.required ? ' [required]' : '';
    console.log(`  ${short}${name}${opt.description}${def}${req}`);
  }
  
  // Always add help option
  console.log(`  -h, ${'--help'.padEnd(20)}Show this help message`);
  
  if (config.examples && config.examples.length > 0) {
    console.log('\nExamples:');
    for (const ex of config.examples) {
      console.log(`  ${ex}`);
    }
  }
  
  console.log('');
}

/**
 * Standard CLI options used across multiple scripts.
 */
export const COMMON_OPTIONS: Record<string, CliOption> = {
  dryRun: {
    name: 'dry-run',
    description: 'Simulate without executing transactions',
  },
  token: {
    name: 'token',
    short: 't',
    description: 'Token address',
    default: 'UPSKILL',
  },
  amount: {
    name: 'amount',
    short: 'a',
    description: 'Amount to process',
  },
  daemon: {
    name: 'daemon',
    short: 'd',
    description: 'Run continuously in daemon mode',
  },
};
