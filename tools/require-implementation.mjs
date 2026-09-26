const command = process.argv[2] ?? 'unknown';
process.stderr.write(`${command}: not implemented; release gate remains open\n`);
process.exitCode = 2;
