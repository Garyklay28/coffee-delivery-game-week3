const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Load the game's exported rules without mounting a browser canvas.
const core = script.slice(0, script.indexOf('const game=Daldongne.mount'));
const context = {module: {exports: {}}};
vm.runInNewContext(core, context);
const g = context.module.exports;

test('ready state does not move or deliver; start and pause control time', () => {
  const s = g.newGame();
  const initial = JSON.stringify(s.n);
  g.step(s, .02, {x: 1});
  assert.equal(JSON.stringify(s.n), initial);
  assert.equal(g.interact(s), false);
  g.start(s);g.step(s,.02);
  assert.equal(s.time,.02);
  g.pause(s);g.step(s,.02);
  assert.equal(s.time,.02);
  g.pause(s);assert.equal(s.status,'playing');
});
test('coffee is required and distant interaction cannot deliver', () => {
  const s = g.newGame();g.start(s);
  s.n = g.ORDERS[0].door;
  assert.equal(g.interact(s),false);
  assert.equal(s.done.length,0);
  assert.equal(s.target,'cafe');
  s.n = g.math.at(0,-1.4);
  assert.equal(g.interact(s),false);
});
test('pick up four cups; duplicate interactions do not add deliveries; a full round starts the next one', () => {
  const s = g.newGame(() => .99);g.start(s);s.n=g.CAFE.door;
  assert.equal(g.interact(s),true);assert.equal(s.carrying,4);
  assert.equal(g.interact(s),false);assert.equal(s.carrying,4);
  for (const [i,site] of g.ORDERS.entries()) {
    s.n=site.door;assert.equal(g.interact(s),true);
    if (i<3) {
      assert.equal(s.done.length,i+1);assert.equal(s.carrying,3-i);
      assert.equal(g.interact(s),false);assert.equal(s.done.length,i+1);
    }
  }
  assert.equal(s.score,8);assert.equal(s.status,'playing');
  assert.equal(s.round,2);assert.equal(s.done.length,0);assert.equal(s.target,'cafe');
  const fresh=g.newGame();assert.equal(fresh.status,'ready');
  assert.equal(fresh.done.length,0);assert.equal(fresh.carrying,0);
});
test('the game ends only once the score reaches 20', () => {
  const s = g.newGame(() => .99);g.start(s);s.n=g.CAFE.door;g.interact(s);
  s.score=17;s.n=g.ORDERS[0].door;g.interact(s);
  assert.equal(s.status,'playing');assert.equal(s.score,19);
  s.n=g.ORDERS[1].door;g.interact(s);
  assert.equal(s.status,'won');assert.equal(s.score,21);
});

const always = () => 0, never = () => .99;
function deliver(s, site) { s.n = site.door; return g.interact(s); }
test('coffee only scores 2; coffee plus secret package scores 5', () => {
  const plain = g.newGame(never);g.start(plain);plain.n=g.CAFE.door;
  assert.equal(g.interact(plain),true);assert.equal(plain.contraband,null);
  assert.equal(deliver(plain,g.ORDERS[0]),true);assert.equal(plain.score,2);

  const s = g.newGame(always);g.start(s);s.n=g.CAFE.door;
  assert.equal(g.interact(s),true);
  assert.equal(s.contraband.to,g.ORDERS[0].id);
  assert.equal(deliver(s,g.ORDERS[0]),true);
  assert.equal(s.score,5);assert.equal(s.contraband,null);assert.equal(s.smuggled,1);
  assert.equal(deliver(s,g.ORDERS[1]),true);assert.equal(s.score,7);
});
test('returning to the cafe offers at most one new job per delivery leg', () => {
  const s = g.newGame(always);g.start(s);s.n=g.CAFE.door;g.interact(s);
  assert.equal(g.interact(s),false);
  deliver(s,g.ORDERS[0]);
  s.n=g.CAFE.door;assert.equal(g.interact(s),true);
  assert.equal(s.contraband.to,g.ORDERS[1].id);assert.equal(s.carrying,3);
  assert.equal(g.interact(s),false);
});
const run = (s, seconds) => {for (let i=0;i<Math.round(seconds/.02);i++) g.step(s,.02);return s};
test('police in front catch a smuggler (-10); behind or without package is safe', () => {
  const setup = (carry, dir, crowd = 0) => {
    const s = g.newGame(always);g.start(s);s.carrying=4;
    if (carry) s.contraband = {to: g.ORDERS[0].id};
    const n = g.pt(0,0), look = g.math.frame(n).e;
    s.police = [{n, h: look, look, home: n, phase: -.024, turnIn: 99, alert: 0}];s.crowds = [];
    const d = g.math.mul(look, dir), away = 1.2 / g.R; // 1.2 walking units in front of / behind the officer
    s.n = g.math.norm(g.math.add(g.math.mul(n,Math.cos(away)),g.math.mul(d,Math.sin(away))));
    s.north = g.math.frame(s.n).u;
    if (crowd) s.crowds = [{n: s.n, h: look, home: s.n, turnIn: 99, speed: 0, margin: 0,
      members: Array.from({length: crowd}, (_, i) => ({dx: Math.cos(i) * .5 / g.R, dz: Math.sin(i) * .5 / g.R, color: '#8d9675', hair: '#675044'}))}];
    g.step(s,.02);return s;
  };
  // Being seen is not instant any more: the meter has to fill first.
  const spotted = setup(true, 1);
  assert.equal(spotted.score,0);assert.ok(spotted.detect > 0);assert.equal(spotted.spotter,spotted.police[0]);
  const caught = setup(true, 1);
  for (let i=0;i<250 && !caught.caught;i++) g.step(caught,.02);   // up to 5s of being watched
  assert.equal(caught.score,-10);assert.equal(caught.contraband,null);assert.equal(caught.caught,1);
  assert.equal(caught.detect,0);assert.equal(caught.popups.length,1,'a -10 popup is shown over the officer');
  const behind = run(setup(true, -1), 3);
  assert.equal(behind.score,0);assert.notEqual(behind.contraband,null);assert.equal(behind.detect,0);
  const clean = run(setup(false, 1), 3);
  assert.equal(clean.score,0);assert.equal(clean.caught,0);assert.equal(clean.detect,0);
  const hidden = run(setup(true, 1, 3), 3);
  assert.equal(hidden.hidden,true);assert.equal(hidden.score,0);assert.notEqual(hidden.contraband,null);
  const tooFew = run(setup(true, 1, 2), 3);
  assert.equal(tooFew.hidden,false);assert.equal(tooFew.score,-10);
});
test('new games spawn patrolling police away from the start', () => {
  const s = g.newGame();
  assert.ok(s.police.length>=6);
  assert.ok(g.walkers(s).length>=20);
  // police keep at least 3 walking steps away from where the player starts
  for (const p of s.police) assert.ok(g.math.angle(p.n,s.n)*g.R >= 3, 'officer spawned too close: '+(g.math.angle(p.n,s.n)*g.R));
});
test('first person: left/right turns in place, up walks toward the facing direction', () => {
  const s = g.newGame();g.start(s);
  const n0 = s.n, north0 = s.north;
  g.step(s,.05,{x:1});
  assert.equal(JSON.stringify(s.n),JSON.stringify(n0));
  assert.ok(g.math.dot(s.north,north0) < .999);
  const facing = s.north;
  g.step(s,.05,{y:-1});
  const moved = g.math.sub(s.n,n0);
  assert.ok(g.math.dot(moved,facing) > 0);
});
test('trees block walking', () => {
  const s = g.newGame();g.start(s);
  const tree = g.TREES[0].n, f = g.math.frame(tree);
  s.n = g.math.norm(g.math.add(tree,g.math.mul(f.e,.6/g.R)));
  s.north = g.math.mul(f.e,-1);
  for (let i=0;i<40;i++) g.step(s,.05,{y:-1});
  assert.ok(g.math.angle(s.n,tree)*g.R >= .3);
});

test('stepping out of view before the meter fills keeps the package', () => {
  const s = g.newGame(() => 0);g.start(s);s.carrying=4;s.crowds=[];
  s.contraband = {to: g.ORDERS[0].id};
  const n = g.pt(0,0), look = g.math.frame(n).e;
  s.police = [{n, h: look, look, home: n, phase: -.024, turnIn: 99, alert: 0}];
  const away = 1.2 / g.R, d = g.math.mul(look,1);
  s.n = g.math.norm(g.math.add(g.math.mul(n,Math.cos(away)),g.math.mul(d,Math.sin(away))));
  s.north = g.math.frame(s.n).u;
  for (let i=0;i<20;i++) g.step(s,.02);          // ~0.4s in view
  const partway = s.detect;
  assert.ok(partway > 0 && partway < 1, 'meter is partly full, not triggered: ' + partway);
  s.police[0].h = g.math.mul(look,-1);            // officer turns away (look follows the heading)
  for (let i=0;i<20;i++) g.step(s,.02);
  assert.ok(s.detect < partway, 'meter falls back when out of view');
  assert.equal(s.score,0);assert.notEqual(s.contraband,null);
});
