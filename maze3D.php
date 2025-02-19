<?php
define('MUTEX_KEY', 123456);
$resource = sem_get(MUTEX_KEY, 1, 0666, 1);
sem_acquire($resource);

$ip = $_SERVER['REMOTE_ADDR'];
$name = $ip;
$logging = false;

// Process message from maze3D.html
$postData = file_get_contents("php://input");
if ($postData !== "") {
    // Decode the JSON data
    $data = json_decode($postData, true);
    $mode = $data['mode'];
    $name = $name . '-' . $data['name'];

    if ($mode === 0) // Update user position and return control data
    {
        // Process the data
        $dbHandler = new DatabaseHandler("maze3D.db");
        $user = $dbHandler->getUserByName($name);
        $user->posX = $data['posX'];
        $user->posZ = $data['posZ'];
        $user->angle = $data['angle'];
        $user->dist = $data['dist'];
        $user->cellX = $data['cellX'];
        $user->cellZ = $data['cellZ'];
        $user->dir0 = $data['dir0'];
        $user->dir90 = $data['dir90'];
        $user->dir180 = $data['dir180'];
        $user->dir270 = $data['dir270'];
        $user->game = $data['game'];
        $user->distLabel = $data['distLabel'];
        if ($user->activeTime() > 1) {
            $user->move = 0;
            $user->left = 0;
            $user->right = 0;
            $user->animate = -1;
            $user->rotate = 0;
            $user->forward = 0;
        }
        $dbHandler->updateUser($user);
        //$dbHandler.delete();

        // Send a response back to the client
        $response = array(
            'move' => $user->move,
            'left' => $user->left,
            'right' => $user->right,
            'animate' => $user->animate,
            'rotate' => $user->rotate,
            'forward' => $user->forward,
            'state' => $user->state,
        );
        echo json_encode($response);
    } elseif ($mode === 1) //Reset movements that have started animation
    {
        $dbHandler = new DatabaseHandler("maze3D.db");
        $user = $dbHandler->getUserByName($name);
        $user->animate = -1;
        $user->rotate = 0;
        $user->forward = 0;
        $dbHandler->updateUser($user);
        echo json_encode("Completed");
    } elseif ($mode === 2) //Get full name
    {
        $response = array('name' => $name);
        echo json_encode($response);
    } elseif ($mode === 3) //Set state
    {
        $dbHandler = new DatabaseHandler("maze3D.db");
        $user = $dbHandler->getUserByName($data['name']);
        $user->state = $data['state'];
        $dbHandler->updateUser($user);
        echo json_encode("Completed");
    }

    //if ($logging && $file = fopen('log.txt', 'a')) {
    //    $info = 'posX = ' . $user->posX . ' posZ = ' . $user->posZ . ' angle = ' . $user->angle . ' dist = ' . $user->dist . "\n";
    //    fwrite($file, $info);
    //    fclose($file);
    //}
}

// Process message from user
$keys = array_keys($_GET);
if (count($keys) > 0) {
    $actionAt = 0;
    $name = $name . '-';
    if ($keys[0] == 'name') {
        $name = $name . $_GET[$keys[0]];
        $actionAt = 1;
    }

    if (count($keys) >= $actionAt && $keys[$actionAt] == 'action') {
        $dbHandler = new DatabaseHandler("maze3D.db");
        $action = $_GET[$keys[$actionAt]];

        switch ($action) {
            case 'test':
                echo 'Success';
                return;
            case 'get':
                $user = $dbHandler->getUserByName($name);
                if ($user !== null) {
                    $response = array(
                        'name' => $user->name,
                        'posX' => $user->posX,
                        'posZ' => $user->posZ,
                        'angle' => $user->angle,
                        'dist' => $user->dist,
                        'move' => $user->move,
                        'left' => $user->left,
                        'right' => $user->right,
                        'cellX' => $user->cellX,
                        'cellZ' => $user->cellZ,
                        'dir0' => $user->dir0,
                        'dir90' => $user->dir90,
                        'dir180' => $user->dir180,
                        'dir270' => $user->dir270,
                        'animate' => $user->animate,
                        'rotate' => $user->rotate,
                        'forward' => $user->forward,
                        'game' => $user->game,
                        'state' => $user->state,
                        'distLabel' => $user->distLabel,
                    );
                    echo json_encode($response);
                } else {
                    echo 'User does not exist';
                }
                break;
            case 'getAll':
                $game = $dbHandler->getUserByName($name)->game;
                $users = $dbHandler->getUsers();
                if ($users !== null) {
                    $response = array();
                    foreach ($users as $user) {
                        if ($user->game == $game && $user->activeTime() < 60) {
                            array_push($response, $user->name, $user->state, $user->posX, $user->posZ);
                        }
                    }
                    echo json_encode($response);
                } else {
                    echo 'No users found';
                }
                break;
            case 'set':
                $user = $dbHandler->getUserByName($name);
                if ($user !== null) {
                    for ($i = $actionAt + 1; $i < count($keys); $i++) {
                        $value = $_GET[$keys[$i]];
                        switch ($keys[$i]) {
                            case 'move':
                                $user->move = $value;
                                break;
                            case 'left':
                                $user->left = $value;
                                break;
                            case 'right':
                                $user->right = $value;
                                break;
                            case 'animate':
                                $user->animate = $value;
                                break;
                            case 'rotate':
                                $user->rotate = $value;
                                break;
                            case 'forward':
                                $user->forward = $value;
                                break;
                            default:
                                break;
                        }
                    }
                }
                $dbHandler->updateUser($user);
                echo 'Success';
                break;
            default:
                break;
        }
        //$dbHandler.delete();

        if ($logging && $file = fopen('log.txt', 'a')) {
            $info = 'name = ' . $name . 'action = ' . $action . ' move = ' . $user->move . ' left = ' . $user->left . ' right = ' . $user->right .
                ' animate = ' . $user->animate . ' rotate = ' . $user->rotate . ' forward = ' . $user->forward .
                ' game = ' . $user->game . ' state = ' . $user->state . "\n";
            fwrite($file, $info);
            fclose($file);
        }
    }
}
sem_release($resource);

class User
{
    public $id;
    public $name;
    public $lastActive;
    public $posX = 0;
    public $posZ = 0;
    public $angle = 0;
    public $dist = 0;
    public $move = 0;
    public $left = 0;
    public $right = 0;
    public $cellX = 0;
    public $cellZ = 0;
    public $dir0 = 0;
    public $dir90 = 0;
    public $dir180 = 0;
    public $dir270 = 0;
    public $animate = -1;
    public $rotate = 0;
    public $forward = 0;
    public $game = "";
    public $state = "";
    public $distLabel = "";


    public function __construct($name, $id = null, $lastActive = null)
    {
        $this->id = $id;
        $this->name = $name;
        $this->lastActive = $lastActive;
    }

    public function activeTime()
    {
        $now = new DateTime('now');
        $then = new DateTime($this->lastActive);
        $interval = $now->diff($then);
        $totalSeconds = ($interval->days * 24 * 60 * 60) +
            ($interval->h * 60 * 60) +
            ($interval->i * 60) +
            $interval->s;
        return $totalSeconds;
    }
}

class DatabaseHandler
{
    private $pdo;

    public function __construct($dbFile)
    {
        try {
            // Create (connect to) SQLite database in file
            $this->pdo = new PDO('sqlite:' . $dbFile);
            // Set error mode to exceptions
            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            // Create a new table
            $sql = "CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    lastActive DATETIME NOT NULL,
                    posX REAL NOT NULL DEFAULT 0,
                    posZ REAL NOT NULL DEFAULT 0,
                    angle REAL NOT NULL DEFAULT 0,
                    dist REAL NOT NULL DEFAULT 0,
                    move INTEGER NOT NULL DEFAULT 0,
                    left INTEGER NOT NULL DEFAULT 0,
                    right INTEGER NOT NULL DEFAULT 0,
                    cellX INTEGER NOT NULL DEFAULT 0,
                    cellZ INTEGER NOT NULL DEFAULT 0,
                    dir0 INTEGER NOT NULL DEFAULT 0,
                    dir90 INTEGER NOT NULL DEFAULT 0,
                    dir180 INTEGER NOT NULL DEFAULT 0,
                    dir270 INTEGER NOT NULL DEFAULT 0,
                    animate INTEGER NOT NULL DEFAULT -1,
                    rotate REAL NOT NULL DEFAULT 0,
                    forward REAL NOT NULL DEFAULT 0,
                    game TEXT NOT NULL DEFAULT '',
                    state TEXT NOT NULL DEFAULT '',
                    distLabel TEXT NOT NULL DEFAULT '')";
            $this->pdo->exec($sql);
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "__construct " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
        }
    }

    public function addUser(User $user)
    {
        try {
            // Insert data
            $sql = "INSERT INTO users (name, lastActive) VALUES ('" . $user->name . "', CURRENT_TIMESTAMP)";
            $this->pdo->exec($sql);
            return true;
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "addUser " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
            return false;
        }
    }

    public function updateUser(User $user)
    {
        try {
            // Replace data
            $sql = "REPLACE INTO users (id, name, lastActive, posX, posZ, angle, dist, move, left, right, 
            cellX, cellZ, dir0, dir90, dir180, dir270, animate,
            rotate, forward, game, state, distLabel) VALUES (
                    " . $user->id . ",
                    '" . $user->name . "',
                    CURRENT_TIMESTAMP,
                    " . $user->posX . ",
                    " . $user->posZ . ",
                    " . $user->angle . ",
                    " . $user->dist . ",
                    " . $user->move . ",
                    " . $user->left . ",
                    " . $user->right . ",
                    " . $user->cellX . ",
                    " . $user->cellZ . ",
                    " . $user->dir0 . ",
                    " . $user->dir90 . ",
                    " . $user->dir180 . ",
                    " . $user->dir270 . ",
                    " . $user->animate . ",
                    " . $user->rotate . ",
                    " . $user->forward . ",
                    '" . $user->game . "',
                    '" . $user->state . "',
                    '" . $user->distLabel . "')";
            $this->pdo->exec($sql);
            return true;
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "updateUser " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
            return false;
        }
    }

    public function deleteUser($name)
    {
        try {
            // Delete data
            $sql = "DELETE FROM users WHERE name = " . $name;
            $this->pdo->exec($sql);
            return true;
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "deleteUser " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
            return false;
        }
    }

    public function getUsers()
    {
        try {
            // Get data
            $sql = "SELECT * FROM users";
            $result = $this->pdo->query($sql);
            $users = array();
            foreach ($result as $row) {
                //echo "User record found.<br />";
                $user = new User($row['name'], $row['id'], $row['lastActive']);
                $user->posX = $row['posX'];
                $user->posZ = $row['posZ'];
                $user->angle = $row['angle'];
                $user->dist = $row['dist'];
                $user->move = $row['move'];
                $user->left = $row['left'];
                $user->right = $row['right'];
                $user->cellX = $row['cellX'];
                $user->cellZ = $row['cellZ'];
                $user->dir0 = $row['dir0'];
                $user->dir90 = $row['dir90'];
                $user->dir180 = $row['dir180'];
                $user->dir270 = $row['dir270'];
                $user->animate = $row['animate'];
                $user->rotate = $row['rotate'];
                $user->forward = $row['forward'];
                $user->game = $row['game'];
                $user->state = $row['state'];
                $user->distLabel = $row['distLabel'];
                array_push($users, $user);
            }
            return $users;
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "getUsers " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
        }
        return null;
    }

    public function getUserByName($name)
    {
        try {
            // Get data
            $sql = "SELECT * FROM users WHERE name = '" . $name . "'";
            $result = $this->pdo->query($sql);
            foreach ($result as $row) {
                //echo "User record found.<br />";
                $user = new User($row['name'], $row['id'], $row['lastActive']);
                $user->posX = $row['posX'];
                $user->posZ = $row['posZ'];
                $user->angle = $row['angle'];
                $user->dist = $row['dist'];
                $user->move = $row['move'];
                $user->left = $row['left'];
                $user->right = $row['right'];
                $user->cellX = $row['cellX'];
                $user->cellZ = $row['cellZ'];
                $user->dir0 = $row['dir0'];
                $user->dir90 = $row['dir90'];
                $user->dir180 = $row['dir180'];
                $user->dir270 = $row['dir270'];
                $user->animate = $row['animate'];
                $user->rotate = $row['rotate'];
                $user->forward = $row['forward'];
                $user->game = $row['game'];
                $user->state = $row['state'];
                $user->distLabel = $row['distLabel'];
                return $user;
            }
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "getUserByName " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
        }
        $user = new User($name);
        $this->addUser($user);
        return $user;
    }

    public function test()
    {
        return;
    }
}
?>