// Utility that recursively renames .js files to .mjs in a given directory

import fs from "fs";
import path from "path";

function renameFilesInDir(directory) {
    fs.readdir(directory, (err, files) => {
        if (err) throw err;

        files.forEach((file) => {
            const fullPath = path.join(directory, file);
            if (fs.statSync(fullPath).isDirectory()) {
                // Recurse into subdirectories
                renameFilesInDir(fullPath);
            } else if (file.endsWith('.js')) {
                // Using /\.js$/ instead of '\.js$' to get the regex literal
                const newFilePath = fullPath.replace(/\.js$/, '.mjs');
                fs.rename(fullPath, newFilePath, (err) => {
                    if (err) throw err;
                    console.log(`Renamed: ${fullPath} -> ${newFilePath}`);
                });
            }
        });
    });
}

if(process.argv.length !== 3) {
    console.log("Must have exactly 1 command line argument: The directory of files to rename.");
    console.log("Usage: rename-js-to-mjs.js [dirname]");
    process.exit(1);
}

renameFilesInDir(process.argv[2]);