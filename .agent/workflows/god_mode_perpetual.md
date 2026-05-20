---
description: God-Mode: Perpetual Architect (Autonomous construction of massive systems)
---
// turbo-all
# God-Mode: Perpetual Architect Protocol

1. Analyze the system requirements using `business_logic_parser`.
2. Generate a 20-phase master plan using `project_planner` and save it to the workspace.
3. Initialize the project state using `project_state_manager` (action: 'init').
4. Start the autonomous construction loop:
   - Scaffold the skeleton using `scaffold_project`.
   - Iterate through each module using the `task_loop` in 'until_success' mode.
   - For every module created, run `quality_run` to ensure ELITE design standards.
5. If an error occurs, use the `error_recovery` tool (Wolverine mode) and retry up to 5 times.
6. Once construction is complete, run a full `analyze_codebase` and `dependency_graph` to verify architecture integrity.
7. Finalize and push to repository.
