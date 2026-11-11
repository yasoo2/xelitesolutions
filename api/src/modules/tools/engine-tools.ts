/**
 * THE AGENT ENGINE'S OWN TOOLS ARE NOT THE FIRST PLANNER'S.
 *
 * The engine's file, shell and browser tools are registered under engine_*
 * names so that every action they take goes through ToolService. They act
 * only for a run of the engine, which binds them to its project folder, and
 * they reach a model only through the engine's adapters (core/engine/tools).
 *
 * Joe's first planner reads the same registry. Measured with the five file
 * tools registered and nothing else changed
 * (D:\Joe\eval\proof\engine\files\resume\probe-old-planner-sees-engine-tools.txt):
 * «read the file src/App.jsx and check it» ranked engine_file_read above
 * read_file, «edit the file index.html and change the title» ranked
 * engine_file_edit above file_edit, and «check the files of the engine and
 * list them» was routed to engine_file_list. That is a second, unguarded way
 * into the engine's tools, and an old request answered by a tool with no
 * project folder of its own. So the first planner's catalogue, its word
 * weights, its capability router and its plan checks leave these names out,
 * by the one prefix every engine tool carries.
 */
export function isEngineTool(name: unknown): boolean {
    return typeof name === 'string' && name.startsWith('engine_');
}
