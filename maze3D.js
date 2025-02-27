/// <reference path="./babylon.d.ts" />

var canvas = document.getElementById("renderCanvas");

var startRenderLoop = function (engine, canvas) {
    engine.runRenderLoop(function () {
        if (sceneToRender && sceneToRender.activeCamera) {
            sceneToRender.render();
        }
    });
}

var engine = null;
var scene = null;
var sceneToRender = null;
var createDefaultEngine = function () { return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: false }); };
var createScene = function () {
    // This creates a basic Babylon Scene object (non-mesh)
    var scene = new BABYLON.Scene(engine);

    // This creates and manages the scene
    const main = new Main(canvas, scene);

    return scene;
};

class Main {
    canvas;
    scene;
    camera;
    pressedKeys;
    externalData;
    target;
    heading;
    advancedTexture;
    info;
    maze;
    walls;
    enemies;
    players;
    name;
    userName;
    game;
    objective;
    objectiveData;
    wallImg;
    floorImg;
    ceilingImg;
    maxFPS;
    state;
    step;
    numAnimate;
    cameraAnimate;
    readyToSend;
    readyToReceive;
    constructor(canvas, scene) {
        this.canvas = canvas;
        this.scene = scene;

        // Setup the sky background, camera, lights, GUI overlay and key controls
        this.settings();
        this.setup();

        // Create maze
        this.externalData = {};
        this.walls = [];
        this.enemies = [];
        this.players = [];
        this.createMaze();
        this.updatePlayers();

        //Objectives
        this.objectiveData = new ObjectiveData(this.maze);

        // Dynamic update ~60fps
        this.step = 0;
        this.state = this.objective;
        let lastTime = performance.now();
        let lastPoll = performance.now();
        globalThis.numAnimate = 0;
        globalThis.cameraAnimate = 0;
        globalThis.readyToSend = true;
        globalThis.readyToReceive = true;

        // Game loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.step++;
            let dt = (performance.now() - lastTime) / 1000; //seconds
            lastTime = performance.now();
            this.info.text = "";

            this.updateSprites();
            let distInfo = this.updateCollisions(dt);
            let doPoll = false;
            if ((lastTime - lastPoll) > 1000 / this.maxFPS) {
                lastPoll = lastTime;
                doPoll = true;
            }
            if (this.name != "Observer") {
                this.updateCamera(dt, distInfo, doPoll);
                this.updateObjective();
            }
        });
    }

    updateObjective() {
        this.heading.text = this.name + (this.game === "" ? "" : " (" + this.game + ")");
        let time;
        if (globalThis.userName != undefined && globalThis.userName !== "") {
            const x = Math.round(this.camera.position.x);
            const z = Math.round(this.camera.position.z);
            switch (this.objective) {
                case "None":
                    break;
                case "Visit all cells":
                    const percent = Math.round(100 * (this.objectiveData.numVisited() - 1) / (this.objectiveData.numCells - 1));
                    if (this.objectiveData.numVisited() < 2) this.objectiveData.startTime = Date.now();
                    if (percent < 100) this.objectiveData.finishTime = Date.now();
                    time = Math.round((this.objectiveData.finishTime - this.objectiveData.startTime) / 1000);

                    this.heading.text += "\n" + this.objective + " : " + percent + "% (" + time + " s)";
                    break;
                case "Tag":
                    time = Math.round((Date.now() - this.objectiveData.startTime) / 1000);
                    if (time < 5) { //Lead-in
                    }
                    else if (this.state !== "TagIt") { //Start-up see if we can become It
                        let otherIt = false;
                        this.players.forEach(player => {
                            if (player.state === "TagIt") {
                                otherIt = true;
                            }
                            else {
                                //console.log(player.name, player.state);
                            }
                        });
                        if (!otherIt) {
                            this.setState(globalThis.userName, "TagIt");
                            console.log("Initial TagIt");
                        };
                    }
                    // User with state "TagIt" is in charge
                    if (this.state === "TagIt" && (x !== 0 || z !== 0)) {
                        //Now check if we have tagged something
                        this.players.every(player => {
                            const playerx = Math.round(player.mesh.position.x);
                            const playerz = Math.round(player.mesh.position.z);
                            if (x === playerx && z === playerz) {
                                this.camera.position.x = 0;
                                this.camera.position.z = 0;
                                this.camera.setTarget(this.camera.position.add(new BABYLON.Vector3(0, 0, 1)));
                                console.log("Revert to Tag");
                                this.setState(globalThis.userName, "Tag");
                                console.log("Other to TagIt");
                                this.setState(player.name, "TagIt");
                                return false;
                            }
                            return true;
                        });
                    }

                    this.heading.text += "\n" + this.objective + " : " + (this.state === "TagIt" ? "You are IT" : "");
                    break;
                case "Hunt Yetis":
                    if (this.enemies.length > 0) {
                        //Now check if we have got a Yeti
                        this.enemies.every(enemy => {
                            const enemyx = Math.round(enemy.mesh.position.x);
                            const enemyz = Math.round(enemy.mesh.position.z);
                            if (x === enemyx && z === enemyz) {
                                enemy.toDelete = true;
                            }
                            return true;
                        });

                        this.objectiveData.finishTime = Date.now();
                    }

                    this.heading.text += "\n" + this.objective;
                    if (this.objectiveData.finishTime === undefined) {
                        this.objectiveData.startTime = Date.now();
                    }
                    else {
                        time = Math.round((this.objectiveData.finishTime - this.objectiveData.startTime) / 1000);
                        this.heading.text += " : " + this.enemies.length + " Yeti remaining (" + time + " s)";
                    }
                    break;
            }
        }
    }

    setState(name, state) {
        console.log("Set state", name, state);
        this.externalData["mode"] = 3;
        this.externalData["name"] = name;
        this.externalData["state"] = state;
        fetch('maze3D.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.externalData)
        })
            .then(response => response.json())
            .then(data => {
            })
            .catch(error => {
            });
    }

    updateCamera(dt, distInfo, doPoll) {
        const x = Math.round(this.camera.position.x);
        const z = Math.round(this.camera.position.z);
        this.objectiveData.visited[x + "," + z] = true;
        //Send to server
        if (doPoll && (this.step % 100 == 0 || globalThis.readyToSend)) {
            globalThis.readyToSend = false;
            globalThis.readyToReceive = true;
            this.externalData["mode"] = 0;
            this.externalData["name"] = this.name;
            this.externalData["game"] = this.game;
            this.externalData["posX"] = this.camera.position.x;
            this.externalData["posZ"] = this.camera.position.z;
            this.externalData["angle"] = this.camera.rotation.y * 180 / Math.PI;
            if (this.externalData["angle"] < 0) this.externalData["angle"] += 360;
            this.externalData["dist"] = distInfo["dist"];
            this.externalData["distLabel"] = distInfo["label"];
            this.externalData["cellX"] = x;
            this.externalData["cellZ"] = z;
            this.externalData["dir270"] = (x > 0 && this.maze[z].charAt(x - 1) != ' ') ? 1 : 0;
            this.externalData["dir90"] = (x < this.maze[z].length - 1 && this.maze[z].charAt(x + 1) != ' ') ? 1 : 0;
            this.externalData["dir180"] = (z > 0 && x < this.maze[z - 1].length && this.maze[z - 1].charAt(x) != ' ') ? 1 : 0;
            this.externalData["dir0"] = (z < this.maze.length - 1 && x < this.maze[z + 1].length && this.maze[z + 1].charAt(x) != ' ') ? 1 : 0;
            // Sending a POST request using Fetch API
            fetch('maze3D.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.externalData)
            })
                .then(response => response.json())
                .then(data => {
                    if (globalThis.readyToReceive) {
                        this.externalData["ArrowUp"] = data.move;
                        this.externalData["ArrowLeft"] = data.left;
                        this.externalData["ArrowRight"] = data.right;
                        this.externalData["Animate"] = data.animate;
                        this.externalData["Rotate"] = data.rotate;
                        this.externalData["Forward"] = data.forward;
                        this.externalData["State"] = data.state;
                        globalThis.readyToSend = true;
                    }
                })
                .catch(error => {
                    if (globalThis.readyToReceive) {
                        this.externalData["ArrowUp"] = 0;
                        this.externalData["ArrowLeft"] = 0;
                        this.externalData["ArrowRight"] = 0;
                        this.externalData["Animate"] = -1;
                        this.externalData["Rotate"] = 0;
                        this.externalData["Forward"] = 0;
                        globalThis.readyToSend = true;
                    }
                });
        }

        if (this.externalData["State"] !== undefined && this.state !== this.externalData["State"]) {
            this.objectiveData.startTime = Date.now();
            this.state = this.externalData["State"];
        }

        //If not a wall then max distance is one cell
        const dist = distInfo["label"].startsWith("wall") ? distInfo["dist"] : Math.max(1, distInfo["dist"]);

        if (globalThis.cameraAnimate <= 0) {
            globalThis.cameraAnimate = 0;

            this.camera.animations = [];
            var maxFrames = 0;

            if (this.externalData["Animate"] != undefined && this.externalData["Animate"] >= 0) {
                const animRotate = new BABYLON.Animation("rotation", "rotation.y", 60 * this.speed, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                maxFrames = Math.max(maxFrames, 60);
                animRotate.setKeys([
                    { frame: 0, value: this.camera.rotation.y },
                    { frame: 30, value: this.rotateTO(this.camera.rotation.y, this.externalData["Animate"] * Math.PI / 180) }
                ]);
                this.camera.animations.push(animRotate);

                const animPosition = new BABYLON.Animation("position", "position", 1.5 * 60 * this.speed, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                const position = new BABYLON.Vector3(this.camera.position.x, this.camera.position.y, this.camera.position.z);
                if (this.externalData["Animate"] == 270 && this.externalData["dir270"] == 1) position.x = x - 1;
                else if (this.externalData["Animate"] == 90 && this.externalData["dir90"] == 1) position.x = x + 1;
                else if (this.externalData["Animate"] == 180 && this.externalData["dir180"] == 1) position.z = z - 1;
                else if (this.externalData["Animate"] == 0 && this.externalData["dir0"] == 1) position.z = z + 1;
                animPosition.setKeys([
                    { frame: 0, value: this.camera.position },
                    { frame: 60, value: position }
                ]);

                const animEvent = new BABYLON.AnimationEvent(60,
                    function () {
                        globalThis.cameraAnimate--;
                    },
                    true
                );
                animPosition.addEvent(animEvent);
                this.camera.animations.push(animPosition);
            }
            if (this.externalData["Rotate"] != undefined && this.externalData["Rotate"] != 0) {
                const animRotate = new BABYLON.Animation("rotation", "rotation.y", 60 * this.speed, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                let angle = Math.abs(this.externalData["Rotate"]);
                if (angle > 180) angle = 360 - angle;
                const frames = Math.max(1, Math.round(30 * angle / 90));
                maxFrames = Math.max(maxFrames, frames);
                animRotate.setKeys([
                    { frame: 0, value: this.camera.rotation.y },
                    { frame: frames, value: this.rotateTO(this.camera.rotation.y, this.camera.rotation.y + this.externalData["Rotate"] * Math.PI / 180) }
                ]);
                this.camera.animations.push(animRotate);
                const animEvent = new BABYLON.AnimationEvent(frames,
                    function () {
                        globalThis.cameraAnimate--;
                    },
                    true
                );
                animRotate.addEvent(animEvent);
                this.camera.animations.push(animRotate);
            }
            if (this.externalData["Forward"] != undefined && this.externalData["Forward"] != 0) {
                const animPosition = new BABYLON.Animation("position", "position", 1.5 * 60 * this.speed, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                let position = this.camera.position;
                let lookDirection = this.camera.getTarget().subtract(position).normalize();
                if (false && this.externalData["Rotate"] != 0) {
                    const quaterion = BABYLON.Quaternion.FromEulerAngles(0, this.externalData["Rotate"] * Math.PI / 180, 0);
                    lookDirection = lookDirection.applyRotationQuaternion(quaterion);
                }
                const distance = Math.min(this.externalData["Forward"], dist - 0.1);
                position = position.add(lookDirection.scale(distance));
                const frames = Math.max(1, Math.round(60 * distance));
                maxFrames = Math.max(maxFrames, frames);
                animPosition.setKeys([
                    { frame: 0, value: this.camera.position },
                    { frame: frames, value: position }
                ]);

                const animEvent = new BABYLON.AnimationEvent(frames,
                    function () {
                        globalThis.cameraAnimate--;
                    },
                    true
                );
                animPosition.addEvent(animEvent);
                this.camera.animations.push(animPosition);
            }

            if (maxFrames > 0) {
                globalThis.cameraAnimate++;
                globalThis.readyToReceive = false;
                this.externalData["Animate"] = -1;
                this.externalData["Rotate"] = 0;
                this.externalData["Forward"] = 0;
                this.scene.beginAnimation(this.camera, 0, maxFrames, false);

                this.externalData["mode"] = 1;
                this.externalData["name"] = this.name;
                fetch('maze3D.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.externalData)
                })
                    .then(response => response.json())
                    .then(data => {
                        globalThis.readyToReceive = true;
                    })
                    .catch(error => {
                        globalThis.readyToReceive = true;
                    });
            }
        }

        let yaw = 0;
        let pitch = 0;
        let roll = 0;
        let move = 0;
        //Time keys down for smoother movement
        if (this.xor(this.pressedKeys["ArrowUp"], this.externalData["ArrowUp"]) && dist > 0.1)
            this.pressedKeys["Up"] += dt;
        else
            this.pressedKeys["Up"] = 0;
        if (this.xor(this.pressedKeys["ArrowLeft"], this.externalData["ArrowLeft"]))
            this.pressedKeys["Left"] += dt;
        else
            this.pressedKeys["Left"] = 0;
        if (this.xor(this.pressedKeys["ArrowRight"], this.externalData["ArrowRight"]))
            this.pressedKeys["Right"] += dt;
        else
            this.pressedKeys["Right"] = 0;
        //Accelerate more if space down
        let acc = this.pressedKeys["Space"] ? 2 : 1;
        //Accelerate movement for first period of key down
        const accTime = 0.001;
        move += 1.5 * this.speed * Math.pow(Math.min(this.pressedKeys["Up"], accTime) / accTime, 2) * acc * dt;
        yaw -= 1.5 * this.speed * Math.pow(Math.min(this.pressedKeys["Left"], accTime) / accTime, 2) * acc * dt;
        yaw += 1.5 * this.speed * Math.pow(Math.min(this.pressedKeys["Right"], accTime) / accTime, 2) * acc * dt;
        //info.text += "\n\n" + pitch + " : " + yaw + " : " + roll + " : " + move + " : " + distInfo["dist"] + " : " + distInfo["label"];
        let position = this.camera.position;
        let lookDirection = this.camera.getTarget().subtract(position).normalize();
        const quaterion = BABYLON.Quaternion.FromEulerAngles(pitch, yaw, roll);
        lookDirection = lookDirection.applyRotationQuaternion(quaterion);
        position = position.add(lookDirection.scale(move));
        this.camera.setTarget(position.add(lookDirection));
        this.camera.position = position;
    }

    xor(a, b) {
        return (a || b) && !(a && b);
    }

    rotateTO(angleFrom, angleTo) {
        if (Math.abs(angleTo - angleFrom) <= Math.PI) return angleTo;
        else if (Math.abs(angleTo + 2 * Math.PI - angleFrom) <= Math.PI) return angleTo + 2 * Math.PI;
        else if (Math.abs(angleTo - 2 * Math.PI - angleFrom) <= Math.PI) return angleTo - 2 * Math.PI;
        return angleTo;
    }

    updateCollisions(dt) {
        const pickResult = this.scene.pick(canvas.width / 2, canvas.height / 2); //Canvas center maybe not a good choice for proximity
        let dist = -1;
        let distLabel = "";
        let infoDist = "";
        if (pickResult.hit) {
            dist = pickResult.distance;
            let mesh = pickResult.pickedMesh;
            while (mesh.parent !== null) mesh = mesh.parent;
            distLabel = mesh.name;
            infoDist = pickResult.distance.toFixed(2) + " m (" + distLabel + ")";
            //const lookDirection = pickResult.pickedPoint.subtract(camera.position);
            //const wallDirection = pickResult.pickedMesh.getFacetNormal(0);
            //dist = Math.abs(wallDirection.dot(lookDirection));
            //dist = lookDirection.length();
        }
        this.info.text += (1 / dt).toFixed(0) + " fps";
        this.info.text += "\nPosition (" + this.camera.position.x.toFixed(2) + "," + this.camera.position.z.toFixed(2) + ")";
        let angle = Math.round(this.camera.rotation.y * 180 / Math.PI);
        if (angle < 0) angle += 360;
        this.info.text += "\nDirection " + angle + " °";
        this.info.text += "\nDistance " + infoDist;

        const distInfo = {};
        distInfo["dist"] = dist;
        distInfo["label"] = distLabel;
        return distInfo;
    }

    updateSprites() {
        if (globalThis.numAnimate == 0) {
            this.enemies.forEach(enemy => {
                if (enemy.toDelete) {
                    let index = this.enemies.indexOf(enemy);
                    if (index !== -1) {
                        this.enemies.splice(index, 1);
                    }
                    enemy.mesh.dispose();
                }
            });

            this.enemies.forEach(enemy => {
                enemy.mesh.animations = [];

                const x = Math.floor(enemy.mesh.position.x);
                const y = Math.floor(enemy.mesh.position.y);
                const z = Math.floor(enemy.mesh.position.z);

                let dirs = [];
                if (x > 0 && this.maze[z].charAt(x - 1) != ' ') dirs.push(0);
                if (x < this.maze[z].length - 1 && this.maze[z].charAt(x + 1) != ' ') dirs.push(1);
                if (z > 0 && x < this.maze[z - 1].length && this.maze[z - 1].charAt(x) != ' ') dirs.push(2);
                if (z < this.maze.length - 1 && x < this.maze[z + 1].length && this.maze[z + 1].charAt(x) != ' ') dirs.push(3);

                if (dirs.indexOf(enemy.direction) !== -1 && Math.random() > 0.2) {
                    //Moving forward is an option
                }
                else if (dirs.length > 0) //Pick one
                {
                    const dir = Math.floor(Math.random() * dirs.length);
                    enemy.direction = dirs[dir];

                    let angle = 0;
                    if (enemy.direction == 0) angle = -Math.PI / 2;
                    else if (enemy.direction == 1) angle = Math.PI / 2;
                    else if (enemy.direction == 2) angle = Math.PI;
                    else if (enemy.direction == 3) angle = 0;

                    const animRotate = new BABYLON.Animation("rotation", "rotation.y", 60 * this.speed, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                    animRotate.setKeys([
                        { frame: 0, value: enemy.angle },
                        { frame: 30, value: this.rotateTO(enemy.angle, angle) }
                    ]);
                    enemy.angle = angle;
                    enemy.mesh.animations.push(animRotate);
                }
                const animPosition = new BABYLON.Animation("position", "position", 60 * this.speed, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                const position = new BABYLON.Vector3(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z);
                if (enemy.direction == 0) position.x -= 1;
                else if (enemy.direction == 1) position.x += 1;
                else if (enemy.direction == 2) position.z -= 1;
                else if (enemy.direction == 3) position.z += 1;
                animPosition.setKeys([
                    { frame: 0, value: enemy.mesh.position },
                    { frame: 60, value: position }
                ]);
                const animEvent = new BABYLON.AnimationEvent(60,
                    function () {
                        globalThis.numAnimate--;
                    },
                    true
                );
                animPosition.addEvent(animEvent);
                enemy.mesh.animations.push(animPosition);

                this.scene.beginAnimation(enemy.mesh, 0, 60, false);
                globalThis.numAnimate++;
            });
        }
    }

    updatePlayers() {
        this.externalData["mode"] = 2;
        this.externalData["name"] = this.name;
        globalThis.name = "";
        fetch('maze3D.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.externalData)
        })
            .then(response => response.json())
            .then(data => {
                globalThis.userName = data.name;
                this.setState(globalThis.userName, this.state);
            })
            .catch(error => {
                globalThis.userName = "";
            });

        const source = new EventSource('maze3Dsse.php');
        source.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            data.forEach(element => {
                this.updatePlayer(element);
            });
        });
        source.addEventListener('open', (e) => {
        });
        source.addEventListener('error', (e) => {
            if (e.readyState == EventSource.CLOSED) {
                console.log("Connection closed");
            }
            else {
                console.log("Error", e);
            }
        });
    }

    updatePlayer(element) {
        const now = new Date(new Date().toUTCString());
        const then = new Date(element.lastActive);
        const inactiveTime = (now - then) / 1000;
        //console.log(globalThis.userName, "Player " + element.name + " inactive for " + inactiveTime + "s");
        if (this.game == element.game && globalThis.userName != undefined && globalThis.userName !== "" && globalThis.userName !== element.name) {
            const player = this.players.find(item => item.name === element.name);
            if (inactiveTime < 60) {
                if (player === undefined) {
                    this.createPlayer(-100, -100, element.name);
                    console.log(globalThis.userName, "Player created " + element.name);
                }
                else {
                    player.mesh.rotation.y = element.angle * Math.PI / 180;// + Math.PI; //+PI since dude is facing backwards
                    player.mesh.position.x = element.posX;
                    player.mesh.position.z = element.posZ;
                    player.state = element.state;
                }
            }
            else if (player !== undefined) {
                console.log(globalThis.userName, "Player destroyed " + element.name);
                let index = this.players.indexOf(player);
                if (index !== -1) {
                    this.players.splice(index, 1);
                }
                player.mesh.dispose();
            }
            else {
                //console.log(globalThis.userName, "Player not present " + element.name, inactiveTime);
            }
        }
    }

    keyEvents() {
        canvas.addEventListener("keydown", e => {
            this.pressedKeys[e.code] = true;
            //this.info.text = e.code;
        });
        canvas.addEventListener("keyup", e => {
            this.pressedKeys[e.code] = false;
        });
    }

    settings() {       // Maze topology
        let empty = localStorage.getItem('empty');
        if (empty) {
            empty = JSON.parse(empty);
        }
        else {
            empty = true;
        }
        if (!empty) {
            const maze = localStorage.getItem('maze');
            if (maze) {
                this.maze = JSON.parse(maze);
            }
            else {
                this.maze = [];
                this.maze[10] = "XXXc XXXXYXXXXdXXXL";
                this.maze[9] = "a  XXXX    ";
                this.maze[8] = "X XXc X XaX";
                this.maze[7] = "XbX XYXX XX";
                this.maze[6] = "       d XX";
                this.maze[5] = "XXcX XLXXXX";
                this.maze[4] = " L X X     ";
                this.maze[3] = " X  XaXXXX ";
                this.maze[2] = "YXXYXXXX LX";
                this.maze[1] = "b X   X   d";
                this.maze[0] = "XXXcXXXbXXX";
            }
        }
        else {
            this.maze = [];
            this.maze[4] = "XXbXX";
            this.maze[3] = "XXXXX";
            this.maze[2] = "XXXXX";
            this.maze[1] = "XXXXX";
            this.maze[0] = "XXXXX";
            this.speed = 1;
        }
        const speed = localStorage.getItem('speed');
        if (speed) {
            this.speed = JSON.parse(speed);
        }
        else {
            this.speed = 1;
        }
        const maxFPS = localStorage.getItem('maxFPS');
        if (maxFPS) {
            this.maxFPS = JSON.parse(maxFPS);
        }
        else {
            this.maxFPS = 60;
        }
        const name = localStorage.getItem('name');
        if (name) {
            this.name = JSON.parse(name);
        }
        else {
            this.name = "";
        }
        const game = localStorage.getItem('game');
        if (game) {
            this.game = JSON.parse(game);
        }
        else {
            this.game = "";
        }
        const objective = localStorage.getItem('objective');
        if (objective) {
            this.objective = JSON.parse(objective);
        }
        else {
            this.objective = "None";
        }
        const wall = localStorage.getItem('wall');
        if (wall) {
            this.wallImg = JSON.parse(wall);
        }
        else {
            this.wallImg = "https://litdev.uk/game_images/uploads/wall.jpg";
        }
        const floor = localStorage.getItem('floor');
        if (floor) {
            this.floorImg = JSON.parse(floor);
        }
        else {
            this.floorImg = "https://litdev.uk/game_images/uploads/stones.jpg";
        }
        const ceiling = localStorage.getItem('ceiling');
        if (ceiling) {
            this.ceilingImg = JSON.parse(ceiling);
        }
        else {
            this.ceilingImg = "https://litdev.uk/game_images/uploads/water.jpg";
        }
    }

    setup() {
        // Background (sky) color - unused if skybox present
        this.scene.clearColor = new BABYLON.Color4(0.1, 0.3, 0.4, 1);

        // Moving skybox
        const boxCloud = BABYLON.MeshBuilder.CreateSphere("boxCloud", { segments: 100, diameter: 1000 }, this.scene);
        boxCloud.position = new BABYLON.Vector3(0, 0, 12);
        const cloudMaterial = new BABYLON.StandardMaterial("cloudMat", this.scene);
        const cloudProcText = new BABYLON.CloudProceduralTexture("cloud", 1024, this.scene);
        cloudMaterial.emissiveTexture = cloudProcText;
        cloudMaterial.backFaceCulling = false;
        cloudMaterial.emissiveTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        boxCloud.material = cloudMaterial;
        const animRotate = new BABYLON.Animation("rotation", "rotation.y", 0.2, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
        animRotate.setKeys([
            { frame: 0, value: 0 },
            { frame: 360, value: 360 }
        ]);
        boxCloud.animations.push(animRotate);
        this.scene.beginAnimation(boxCloud, 0, 360, true);

        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        const light1 = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), this.scene);
        const light2 = new BABYLON.HemisphericLight("light2", new BABYLON.Vector3(0, -1, 0), this.scene);

        if (this.name == "Observer") {
            // This attaches the camera to the canvas - mouse control
            this.camera = new BABYLON.FlyCamera("FlyCamera", new BABYLON.Vector3(5, 20, 5), this.scene);
            this.camera.attachControl(canvas, true);
            this.camera.setTarget(new BABYLON.Vector3(0, 0.5, 0));
            // Airplane like rotation, with faster roll correction and banked-turns.
            // Default is 100. A higher number means slower correction.
            this.camera.rollCorrect = 10;
            // Default is false.
            this.camera.bankedTurn = false;
            // Defaults to 90° in radians in how far banking will roll the camera.
            this.camera.bankedTurnLimit = Math.PI / 2;
            // How much of the Yawing (turning) will affect the Rolling (banked-turn.)
            // Less than 1 will reduce the Rolling, and more than 1 will increase it.
            this.camera.bankedTurnMultiplier = 1;
            this.camera.speed = 0.25;
            light1.intensity = 0.4;
            light2.intensity = 0.1;
        }
        else {
            // This creates and positions a free camera (non-mesh)
            this.camera = new BABYLON.FreeCamera("FreeCamera", new BABYLON.Vector3(0, 0.5, 0), this.scene);
            this.camera.setTarget(new BABYLON.Vector3(0, 0.5, 1));
            light1.intensity = 0.1;
            light2.intensity = 0.1;
        }
        this.camera.minZ = 0.001;
        this.camera.maxZ = 1000.0;
        const cameraLight = new BABYLON.PointLight("cameraLight", new BABYLON.Vector3(0, 0, 0), this.scene);
        cameraLight.range = 5;
        cameraLight.intensity = 0.3;
        cameraLight.parent = this.camera;

        // GUI overlay
        this.advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.target = new BABYLON.GUI.Image("target", "https://litdev.uk/game_images/uploads/sights.png");
        this.heading = new BABYLON.GUI.TextBlock();
        this.info = new BABYLON.GUI.TextBlock();
        this.createGUI();

        // Key controls
        this.pressedKeys = {};
        this.keyEvents();
    }

    createGUI() {
        this.target.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.target.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.target.width = "50px";
        this.target.height = "50px";
        this.target.alpha = 0.5;
        this.advancedTexture.addControl(this.target);

        this.info.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.info.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.info.color = "red";
        this.info.fontSize = 12;
        this.advancedTexture.addControl(this.info);

        var button1 = BABYLON.GUI.Button.CreateSimpleButton("button1", "Open settings");
        button1.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        button1.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        button1.color = "white";
        button1.fontSize = 12;
        button1.top = "60px";
        button1.width = "90px";
        button1.height = "18px";
        button1.background = "red";
        button1.alpha = 0.5;
        this.advancedTexture.addControl(button1);
        button1.onPointerClickObservable.add(() => window.location = "settings.html");

        this.heading.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.heading.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.heading.color = "red";
        this.heading.fontSize = 24;
        this.heading.top = "0px";
        this.heading.height = "60px";
        this.heading.width = "500px";
        this.advancedTexture.addControl(this.heading);
    }

    createMaze() {
        // Surface materials
        let materials = [];
        this.loadMaterials(materials);
        let numWallArt = {};
        const maxWallArt = 1;

        for (let z = 0; z < this.maze.length; z++) {
            for (let x = 0; x < this.maze[z].length; x++) {
                numWallArt[100 * z + x] = 0;
            }
        }

        for (let z = 0; z < this.maze.length; z++) {
            for (let x = 0; x < this.maze[z].length; x++) {
                const char = this.maze[z].charAt(x);

                //Floor/ceiling
                if (this.name == "Observer" || char !== " ") {
                    this.createWall(x, z, "Y-", materials[1], char);
                    this.createWall(x, z, "Y+", materials[2], char);
                }

                //External
                //XNEG
                if (x == 0) {
                    const index = numWallArt[100 * z + x] < maxWallArt ? this.wallIndex(char, true) : 0;
                    if (index > 0) numWallArt[100 * z + x]++;
                    this.createWall(x, z, "X-", materials[index], char);
                }
                //XPOS
                if (x == this.maze[z].length - 1) {
                    const index = numWallArt[100 * z + x] < maxWallArt ? this.wallIndex(char, true) : 0;
                    if (index > 0) numWallArt[100 * z + x]++;
                    this.createWall(x, z, "X+", materials[index], char);
                }
                //ZNEG
                if (z == 0 || x >= this.maze[z - 1].length) {
                    const index = numWallArt[100 * z + x] < maxWallArt ? this.wallIndex(char, true) : 0;
                    if (index > 0) numWallArt[100 * z + x]++;
                    this.createWall(x, z, "Z-", materials[index], char);
                }
                //ZPOS
                if (z == this.maze.length - 1 || x >= this.maze[z + 1].length) {
                    const index = numWallArt[100 * z + x] < maxWallArt ? this.wallIndex(char, true) : 0;
                    if (index > 0) numWallArt[100 * z + x]++;
                    this.createWall(x, z, "Z+", materials[index], char);
                }

                //Internal
                if (char == ' ') {
                    //XNEG
                    if (x > 0) {
                        const index = numWallArt[100 * z + x - 1] < maxWallArt ? this.wallIndex(this.maze[z].charAt(x - 1), false) : 0;
                        if (index > 0) numWallArt[100 * z + x - 1]++;
                        this.createWall(x, z, "X-", materials[index], char);
                    }
                    //XPOS
                    if (x < this.maze[z].length - 1) {
                        const index = numWallArt[100 * z + x + 1] < maxWallArt ? this.wallIndex(this.maze[z].charAt(x + 1), false) : 0;
                        if (index > 0) numWallArt[100 * z + x + 1]++;
                        this.createWall(x, z, "X+", materials[index], char);
                    }
                    //ZNEG
                    if (z > 0 && x < this.maze[z - 1].length) {
                        const index = numWallArt[100 * (z - 1) + x] < maxWallArt ? this.wallIndex(this.maze[z - 1].charAt(x), false) : 0;
                        if (index > 0) numWallArt[100 * (z - 1) + x]++;
                        this.createWall(x, z, "Z-", materials[index], char);
                    }
                    //ZPOS
                    if (z < this.maze.length - 1 && x < this.maze[z + 1].length) {
                        const index = numWallArt[100 * (z + 1) + x] < maxWallArt ? this.wallIndex(this.maze[z + 1].charAt(x), false) : 0;
                        if (index > 0) numWallArt[100 * (z + 1) + x]++;
                        this.createWall(x, z, "Z+", materials[index], char);
                    }
                }

                if (char == 'Y') {
                    this.createEnemy(x, z);
                }
                else if (char == 'L') {
                    const light = new BABYLON.PointLight("light", new BABYLON.Vector3(x, 0.95, z), this.scene);
                    light.range = 2;
                    light.diffuse = new BABYLON.Color3(1, 0.8, 0.8);
                    light.intensity = 0.5;
                }
            }
        }
    }

    wallIndex(char, external) {
        let index = 0;
        switch (char) {
            case "a":
                index = external ? 4 : 3;
                break;
            case 'b':
                index = external ? 6 : 5;
                break;
            case 'c':
                index = external ? 8 : 7;
                break;
            case 'd':
                index = external ? 10 : 9;
                break;
        }
        return index;
    }

    loadMaterials(materials) {
        let i = 0;
        materials[i] = new BABYLON.StandardMaterial(this.wallImg, this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture(this.wallImg, this.scene);
        materials[i] = new BABYLON.StandardMaterial(this.floorImg, this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture(this.floorImg, this.scene);
        materials[i] = new BABYLON.StandardMaterial(this.ceilingImg, this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture(this.ceilingImg, this.scene);

        materials[i] = new BABYLON.StandardMaterial("bug", this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/bug.png", this.scene);
        materials[i] = new BABYLON.StandardMaterial("bugT", this.scene);
        materials[i].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/bug.png", this.scene);
        materials[i++].diffuseTexture.hasAlpha = true;

        materials[i] = new BABYLON.StandardMaterial("head", this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/head.png", this.scene);
        materials[i] = new BABYLON.StandardMaterial("headT", this.scene);
        materials[i].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/head.png", this.scene);
        materials[i++].diffuseTexture.hasAlpha = true;

        materials[i] = new BABYLON.StandardMaterial("tree", this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/Tree.png", this.scene);
        materials[i] = new BABYLON.StandardMaterial("treeT", this.scene);
        materials[i].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/Tree.png", this.scene);
        materials[i++].diffuseTexture.hasAlpha = true;

        materials[i] = new BABYLON.StandardMaterial("coffee", this.scene);
        materials[i++].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/coffee.png", this.scene);
        materials[i] = new BABYLON.StandardMaterial("coffeeT", this.scene);
        materials[i].diffuseTexture = new BABYLON.Texture("https://litdev.uk/game_images/uploads/coffee.png", this.scene);
        materials[i++].diffuseTexture.hasAlpha = true;
    }

    createWall(x, z, side, material, char) {
        const wall = BABYLON.MeshBuilder.CreatePlane("wall" + this.walls.length.toString(), { sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
        wall.checkCollisions = true;

        switch (side) {
            case "X-":
                wall.position.x = x - 0.5;
                wall.position.y = 0.5;
                wall.position.z = z;
                wall.material = material;
                wall.rotateAround(wall.position, new BABYLON.Vector3(0, 1, 0), Math.PI / 2);
                break;
            case "X+":
                wall.position.x = x + 0.5;
                wall.position.y = 0.5;
                wall.position.z = z;
                wall.material = material;
                wall.rotateAround(wall.position, new BABYLON.Vector3(0, 1, 0), Math.PI / 2);
                break;
            case "Y-":
                wall.position.x = x;
                wall.position.y = 0;
                wall.position.z = z;
                wall.material = material;
                wall.rotateAround(wall.position, new BABYLON.Vector3(1, 0, 0), Math.PI / 2);
                break;
            case "Y+":
                wall.position.x = x;
                wall.position.y = 1;
                wall.position.z = z;
                wall.material = material;
                wall.material.alpha = this.name == "Observer" ? 0.2 : 0.5;
                wall.rotateAround(wall.position, new BABYLON.Vector3(1, 0, 0), Math.PI / 2);
                break;
            case "Z-":
                wall.position.x = x;
                wall.position.y = 0.5;
                wall.position.z = z - 0.5;
                wall.material = material;
                break;
            case "Z+":
                wall.position.x = x;
                wall.position.y = 0.5;
                wall.position.z = z + 0.5;
                wall.material = material;
                break;
        }

        wall.freezeWorldMatrix()
        this.walls.push(wall);
    };

    createEnemy(x, z) {
        BABYLON.SceneLoader.ImportMeshAsync("", Assets.meshes.Yeti.rootUrl, Assets.meshes.Yeti.filename, this.scene).then((result) => {
            const enemy = result.meshes[0];
            enemy.checkCollisions = true;
            enemy.name = "Yeti " + (1 + this.enemies.length).toString();
            enemy.rotationQuaternion = null;
            const scale = 0.75 / (2 * result.geometries[0].meshes[0].getBoundingInfo().boundingBox.extendSize.y); //For Yeti
            //const scale = 1 / (2 * result.geometries[0].meshes[0].getBoundingInfo().boundingBox.extendSize.y); //For Alien
            enemy.scaling = new BABYLON.Vector3(scale, scale, scale);
            enemy.position.x = x;
            enemy.position.y = 0;
            enemy.position.z = z;

            const plane = BABYLON.MeshBuilder.CreatePlane("plane" + this.enemies.length.toString());
            plane.parent = enemy;
            plane.scaling = new BABYLON.Vector3(1 / scale, 1 / scale, 1 / scale);
            plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            plane.position.y = 0.85 / scale;
            plane.position.z = -0.02 / scale;

            const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane);
            const text = new BABYLON.GUI.TextBlock();
            text.color = "orange";
            text.fontSize = 50;
            text.text = enemy.name;
            advancedTexture.addControl(text);

            this.enemies.push(new Enemy(enemy));
        });
    }

    createPlayer(x, z, name) {
        //BABYLON.SceneLoader.ImportMeshAsync("", Assets.meshes.dude.rootUrl, Assets.meshes.dude.filename, this.scene).then((result) => {
        BABYLON.SceneLoader.ImportMeshAsync("", "scenes/BrainStem/", "BrainStem.gltf", this.scene).then((result) => {
            let label = name.slice(name.indexOf('-') + 1);
            if (label.length === 0) label = "Unknown";
            if (label == "Observer") return;

            const player = result.meshes[0];
            player.checkCollisions = true;
            player.name = name;
            player.rotationQuaternion = null;
            //const scale = 0.14 / (2 * result.meshes[1].getBoundingInfo().boundingBox.extendSize.y);
            const scale = 0.055 / (2 * result.meshes[1].getBoundingInfo().boundingBox.extendSize.y);
            player.scaling = new BABYLON.Vector3(scale, scale, scale);
            player.position.x = x;
            player.position.y = 0;
            player.position.z = z;

            const plane = BABYLON.MeshBuilder.CreatePlane("plane" + this.players.length.toString());
            plane.parent = player;
            plane.scaling = new BABYLON.Vector3(1 / scale, 1 / scale, 1 / scale);
            plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            plane.position.y = 0.85 / scale;
            plane.position.z = -0.05 / scale;

            const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane);
            const text = new BABYLON.GUI.TextBlock();
            text.color = "yellow";
            text.fontSize = 50;
            text.text = label;
            advancedTexture.addControl(text);

            this.scene.beginAnimation(result.skeletons[0], 0, 100, true, 1.0);

            const newPlayer = new Player(player, result.skeletons[0]);
            newPlayer.name = name;
            this.players.push(newPlayer);
        });
    }
}

class Enemy {
    mesh;
    direction = 0;
    angle = 0;
    toDelete = false;
    constructor(mesh) {
        this.mesh = mesh;
    }
}

class Player {
    name;
    mesh;
    skeleton;
    state;
    constructor(mesh, skeleton) {
        this.mesh = mesh;
        this.skeleton = skeleton;
    }
}

class ObjectiveData {
    numCells;
    visited;
    startTime;
    finishTime;
    constructor(maze) {
        this.numCells = 0;
        for (let z = 0; z < maze.length; z++) {
            for (let x = 0; x < maze[z].length; x++) {
                const char = maze[z].charAt(x);
                if (char != ' ') this.numCells++;
            }
        }
        this.visited = {};
        this.startTime = new Date();
    }

    numVisited() {
        return Object.keys(this.visited).length;
    }
}

window.initFunction = async function () {
    var asyncEngineCreation = async function () {
        try {
            return createDefaultEngine();
        } catch (e) {
            console.log("the available createEngine function failed. Creating the default engine instead");
            return createDefaultEngine();
        }
    }

    window.engine = await asyncEngineCreation();
    if (!engine) throw 'engine should not be null.';
    startRenderLoop(engine, canvas);
    window.scene = createScene();
};
initFunction().then(() => {
    sceneToRender = scene
});

// Resize
window.addEventListener("resize", function () {
    engine.resize();
});
