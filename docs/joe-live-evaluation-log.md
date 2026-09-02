# Joe Live Evaluation Log

The entries below are executed through the Joe UI at `http://localhost:5002/joe`, one prompt at a time. The log distinguishes the first observed failure from the repaired rerun.

| Prompt | Task | First result | General repair | Rerun evidence |
| --- | --- | --- | --- | --- |
| P01 | List top-level workspace files and summarize README without changes | Passed | None | Chat gave a concise summary; discovery details stayed in Logs |
| P02 | Create `joe-prompt-02.txt` with three exact lines, read it back, and report it | Failed: negated “do not change other files” was treated as a whole-request read-only guard; a retry also exposed slow generic planning | Context-aware mutation detection plus explicit file-contract planning | File exists with exact three lines; chat reported content; no project scaffold was created by the passing run |
| P03 | Create a folder and a file inside it, then read it back | Failed: the file name was written at workspace root and the folder relationship was dropped | Preserve explicit folder + “inside it” context in the reusable file-path parser | `joe-prompt-03/README.txt` contains the exact two lines; root `README.txt` is absent |

## Current Gaps

- The live sequence has verified only three prompts so far; it is not evidence that Joe handles the remaining 47 or all real-world task classes.
- GitHub disconnect is implemented and statically covered, but the connected-state click still needs a live session with a valid user token.
- Browser QA and existing-project continuation require the next progressively harder prompts and independent artifact checks.
