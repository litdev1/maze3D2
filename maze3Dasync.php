<?php
set_time_limit(seconds: 30);
$ip = $_SERVER['REMOTE_ADDR'];
$name = $ip;

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
        $reply = "";

        while ($reply == "") {
            usleep(100 * 1000);
            
            switch ($action) {
                case 'isReady':
                    if ($dbHandler->isUserReady($name)) {
                        $reply = "Ready";
                    }
                    break;
                default:
                    $reply = "Unknown action";
                    break;
            }
        }
    } else {
        $reply = "No action";
    }
    echo $reply;
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
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "__construct " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
        }
    }

    public function isUserReady($name)
    {
        try {
            // Get data
            $sql = "SELECT * FROM users WHERE name = '" . $name . "'";
            $result = $this->pdo->query($sql);
            if (!$result) {
                return true;
            }
            foreach ($result as $row) {
                $ret = $row['animate'] == -1 && $row['rotate'] == 0 && $row['forward'] == 0;
                /*
                if ($file = fopen('log.txt', 'a')) {
                    fwrite($file, $row['animate'] . " , " . $row['rotate'] . " , " . $row['forward'] . "\n");
                    fclose($file);
                }
                */
                return $ret;
            }
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "isUserReady " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
        }
        return true;
    }
}
?>