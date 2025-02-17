<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');

$dbHandler = new DatabaseHandler("maze3D.db");

while (true) {
    // Cap the maximum execution time at 30 seconds to prevent PHP from timing out
    set_time_limit(30);

    $dbHandler->purgeUsers();
    $users = $dbHandler->getUsers();
    echo "data: " . json_encode($users) . PHP_EOL;
    echo PHP_EOL;
    ob_flush();
    flush();

    usleep( 100 * 1000 );
    //sleep(1);
}

class DatabaseHandler {
    private $pdo;

    public function __construct($dbFile) {
        try {
            // Create (connect to) SQLite database in file
            $this->pdo = new PDO('sqlite:' . $dbFile);
            // Set error mode to exceptions
            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $e) {
            if ($file=fopen('errors.txt','a'))
            {
                $info = "__construct " . $e->getMessage() . "\n";
                fwrite($file,$info);
                fclose($file);
            }
        }
    }

    public function getUsers() {
        try {
            // Get data
            $sql = "SELECT * FROM users";
            $result = $this->pdo->query($sql);
            $users = array();
            foreach ($result as $row) {
                array_push($users, $row);
            }
            return $users;
        } catch (PDOException $e) {
            if ($file=fopen('errors.txt','a'))
            {
                $info = "getUsers " . $e->getMessage() . "\n";
                fwrite($file,$info);
                fclose($file);
            }
        }
        return null;
    }

    public function purgeUsers()
    {
        try {
            // Delete data
            $sql = "DELETE FROM users WHERE (lastActive < DATE('now', '-1 days')) AND dist = 0.0";
            $this->pdo->exec($sql);
            return true;
        } catch (PDOException $e) {
            if ($file = fopen('errors.txt', 'a')) {
                $info = "purgeUsers " . $e->getMessage() . "\n";
                fwrite($file, $info);
                fclose($file);
            }
            return false;
        }
    }
}
?>