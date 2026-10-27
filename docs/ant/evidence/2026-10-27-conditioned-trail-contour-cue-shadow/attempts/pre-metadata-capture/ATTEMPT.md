# Pre-metadata capture attempt

The first complete render reached all four registered milestones and wrote three 640×640 bounded videos plus twelve native stills. Finalization stopped on the frame-map comparison because the runner read the prior package's `fullStateSha256` from CSV column 8; its saved header places that hash in column 7. This was a runner indexing error, not a world-state mismatch. No media was reviewed or used as an artistic result. The generated files are held here until a corrected replay verifies their SHA-256 values; see `MEDIA-SHA256.txt`.
