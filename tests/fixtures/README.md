# Fixtures

The parser tests read the real committed files in `data/raw/jma/` rather than
trimmed copies, so a test failure means the actual build input changed. The
single-line fixtures below exist to test the error paths (short lines, unreadable
fields) without corrupting the raw data.
