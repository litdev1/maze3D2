<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');

$dbHandler = new DatabaseHandler("maze3D.db");

while (true) {
    // Cap the maximum execution time at 30 seconds to prevent PHP from timing out
    set_time_limit(30);

    echo "data: " . json_encode($dbHandler->getUsers()) . PHP_EOL;
    echo PHP_EOL;
    ob_flush();
    flush();

    sleep(1);
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
                $user = array(
                    'name' => $row['name'],
                    'lastActive' => $row['lastActive'],
                    'posX' => $row['posX'],
                    'posZ' => $row['posZ'],
                    'angle' => $row['angle'],
                    'dist' => $row['dist'],
                    'move' => $row['move'],
                    'left' => $row['left'],
                    'right' => $row['right'],
                    'cellX' => $row['cellX'],
                    'cellZ' => $row['cellZ'],
                    'dir0' => $row['dir0'],
                    'dir90' => $row['dir90'],
                    'dir180' => $row['dir180'],
                    'dir270' => $row['dir270'],
                    'animate' => $row['animate'],
                );
                array_push($users, $user);
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
}
?>