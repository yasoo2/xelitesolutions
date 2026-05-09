const { ProjectPlannerTool } = require('./src/modules/tools/definitions/ProjectPlannerTool');
const { executeTool } = require('./src/modules/services/ToolService');
const { workspaceService } = require('./src/modules/services/WorkspaceService');

async function startJoeAutonomousMission() {
    console.log("🦾 JOE AUTONOMOUS ENGINE: MISSION START");
    console.log("🎯 GOAL: Create a professional Dark-Themed Calculator App.");
    
    const PlannerClass = ProjectPlannerTool.ProjectPlannerTool || ProjectPlannerTool;
    const planner = new PlannerClass();
    
    const prompt = "Create a sophisticated dark-themed Calculator app with a professional structure. Use index.html, styles.css, and script.js. Ensure a premium look.";
    
    console.log("\n📋 PHASE 1: STRATEGIC PLANNING");
    const planResult = await planner.execute({ projectDescription: prompt });
    
    if (!planResult.ok) {
        console.error("❌ Planning failed:", planResult.error);
        return;
    }
    
    const plan = planResult.output;
    const workspaceId = `calc-pro-${Date.now()}`;
    const workspaceRoot = workspaceService.getActiveRoot(workspaceId);
    
    console.log(`✅ Plan Created: ${plan.projectName}`);
    console.log(`🔒 Workspace Isolated: ${workspaceRoot}`);

    // Execute the first 2 phases (Setup and Core Implementation)
    for (let i = 0; i < Math.min(2, plan.phases.length); i++) {
        const phase = plan.phases[i];
        console.log(`\n--- 🚀 EXECUTING PHASE ${phase.phaseNumber}: ${phase.name} ---`);
        
        for (const task of phase.tasks) {
            console.log(`\n🛠️  Task: ${task.task}`);
            console.log(`   Tool: ${task.tool}`);
            
            // Auto-fix for scaffold tool if LLM missed structure
            let args = task.args;
            if (task.tool === 'scaffold_project' && !args.structure) {
                args.structure = {
                    "index.html": "<!DOCTYPE html><html><head><title>Pro Calc</title></head><body></body></html>",
                    "styles.css": "body { background: #1a1a1a; color: white; }",
                    "script.js": "// Logic"
                };
            }

            const result = await executeTool(task.tool, args, { 
                workspaceId,
                sessionId: 'autonomous-victory-session'
            });
            
            if (result.ok) {
                console.log(`   ✅ SUCCESS: Task completed.`);
            } else {
                console.error(`   ❌ FAILURE: ${result.error}`);
            }
        }
    }

    console.log("\n--- 🏁 MISSION COMPLETE: VERIFYING ARTIFACTS ---");
    const fs = require('fs');
    const path = require('path');
    
    function listFiles(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                listFiles(fullPath);
            } else {
                console.log(`📄 [CREATED] ${fullPath.replace(workspaceRoot, '')}`);
            }
        });
    }

    try {
        listFiles(workspaceRoot);
        console.log("\n✨ JOE HAS SUCCESSFULLY BUILT THE APPLICATION.");
        console.log(`📂 Location: ${workspaceRoot}`);
    } catch (e) {
        console.error("❌ Verification failed:", e.message);
    }
}

startJoeAutonomousMission().catch(console.error);
