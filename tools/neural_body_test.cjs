const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('web/app.js','utf8');
const context={Math,Number,motor:{forward:0,turn:0,brake:0},simulation:{x:.5,y:.5,motorAt:100},
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),bodyFits:()=>true,setBehavior(){},setText(){}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function integrateNeuralBody'),source.indexOf('function spawnFoodPoint')),context);
context.integrateNeuralBody(.04,110);
assert.equal(context.simulation.x,.5);assert.equal(context.simulation.y,.5);
context.motor.forward=.7;context.integrateNeuralBody(.04,120);assert(context.simulation.x>.5);
const before=context.simulation.x;
context.integrateNeuralBody(.04,900);assert.equal(context.simulation.x,before,'expired motor command must stop');
context.simulation.motorAt=900;context.bodyFits=()=>false;context.integrateNeuralBody(.04,910);
assert.equal(context.simulation.x,before,'wall blocks movement');assert.equal(context.simulation.bodyAngle,0,'collision must not choose turn');
context.motor.turn=.5;context.integrateNeuralBody(.04,920);assert(context.simulation.bodyAngle>0,'brain can turn at wall');
assert(!source.includes('function chooseDecision'));assert(!source.includes('function mazeDirection'));
console.log('PASS: neural-only movement, stale-command stop, physical collision, neural turn, no route selector');
