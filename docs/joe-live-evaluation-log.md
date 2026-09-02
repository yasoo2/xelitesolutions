# Joe Live Evaluation Log

The entries below are executed through the Joe UI at `http://localhost:5002/joe`, one prompt at a time. The log distinguishes the first observed failure from the repaired rerun.

| Prompt | Task | First result | General repair | Rerun evidence |
| --- | --- | --- | --- | --- |
| P01 | List top-level workspace files and summarize README without changes | Passed | None | Chat gave a concise summary; discovery details stayed in Logs |
| P02 | Create `joe-prompt-02.txt` with three exact lines, read it back, and report it | Failed: negated “do not change other files” was treated as a whole-request read-only guard; a retry also exposed slow generic planning | Context-aware mutation detection plus explicit file-contract planning | File exists with exact three lines; chat reported content; no project scaffold was created by the passing run |
| P03 | Create a folder and a file inside it, then read it back | Failed: the file name was written at workspace root and the folder relationship was dropped | Preserve explicit folder + “inside it” context in the reusable file-path parser | `joe-prompt-03/README.txt` contains the exact two lines; root `README.txt` is absent |
| P04 | Run a read-only local diagnostic and report Node.js version plus workspace path | Failed: the read-only classifier missed the terminal-diagnostic route and entered slow model analysis; run was stopped before any action | Add a generic bounded terminal-diagnostic classifier, preserve read-only safety, and map semantic version/path requests to an allowlisted command plan | Rerun through Joe UI displayed `v24.18.0` and the real workspace path in chat; Terminal received `node --version` and `pwd`; run finished with no writes, installs, or server start |
| P05 | Read two named files, compare their exact content and line counts, and report marker status | Failed: first rerun stopped because multi-project discovery demanded an explicit project; second rerun read both files but chat omitted line counts and marker limits | Add explicit read-file targeting in the active workspace and a structured multi-file report that never invents an unspecified marker | Final rerun read both files through `read_file`; chat showed `3` and `2` lines, exact content, and clearly stated that no marker value was supplied; no writes occurred |
| P06 | Read two named files, report exact content and line counts, and verify two supplied markers | Failed: the report initially treated explicit markers as unspecified and displayed “the selected file” instead of real file names | Extract marker contracts, pass them with each read step, calculate PASS/FAIL from content, and use the trusted input path in the report | Final Joe UI rerun showed both real filenames, `3`/`2` lines, both markers as `PASS`, exact content, and no modifications |
| P07 | Read one named file and verify a marker that is intentionally absent | Passed | None | Joe UI reported the exact `3`-line content and `Marker: FAIL` for the absent marker; no writes occurred |
| P08 | Inspect a named directory, list entries, and confirm `README.txt` exists inside it | Failed: the file extractor treated `README.txt` as a root file, producing `File not found` and an unnecessary search/model detour | Add a generic explicit-directory contract before file extraction, preserve the expected entry, execute `inspect_directory`, and compose a directory evidence report | Rerun through Joe UI completed in 5 steps; Logs showed the real directory path, chat listed `[file] README.txt`, confirmed it exists in `joe-prompt-03`, and stated no files were modified |

## Current Gaps

- The live sequence has verified eight prompts so far; it is not evidence that Joe handles the remaining 42 or all real-world task classes.
- GitHub disconnect is implemented and statically covered, but the connected-state click still needs a live session with a valid user token.
- Browser QA and existing-project continuation require the next progressively harder prompts and independent artifact checks.
- P04 proves the bounded terminal diagnostic path for version/path requests; arbitrary shell text is still intentionally rejected.
- P08 proves explicit directory targeting for a named folder and nested entry; recursive depth and more ambiguous directory language still need coverage.
