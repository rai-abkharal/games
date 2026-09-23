const { spawn } = require('child_process');

const key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDt393KhO3zzGjFn+3eeVnVgLiZiBhw1NUGNjFE/3CwMU3vmNVmbTd4SYJv+Ibqb2I40786lZqKByj+OrALvRHy+KRGwm3QuwUkuxvWFlK3fy1sLvEbvzVTVBs10fTdTdXrxYc6bB73tHdz5ZfL4pBC++LfYX4/0wYOx8EXCBdFM70etmDtzF32K8WFJv0F5lz/EMaKKygPk4EYaI7fOycoxGjoXbxgNwhlnC3AIp5el8u+cAFJZ/gKq9JzcJVH2Lk47TEDqUn4Mndu6eddWfu0DgY9hLRSHu+wdFnvVO3jhY6gc2RCi54PG7tVr1ld5cpBoLUC8ylzEf6xUxYsvyPNKZ2kxRYkHEZcD6mYAnTd22lQlQNzA8qsj7pBTqpGtympFjmUfaKt1m3H2jOckuhGYiar1cALr4CDYnloGI3sBbGQ49fjvc5kE8Y5obw4DQBIPtjupKlHqDi3zslnhGjuJSKbvTmlwfHr6iG8bCxvyVk/1WrnQ8SzFHEOa6YH4jjxRDqxK7mkVeybgPtCol9kLz169p6QRdiAYhOCDlDmztoFKgni1TiQF777PkGtN5/+eq785lT1Zcu2M5iYQhrBBZWaWNsN7Ec6EV/ewN+S9yMOYFiGhy/XVl8UsUarn6zIiNWDQa7ilp7G94clvAzppEjfnQTFtPtZPOIpNjKwPQ== root@srv1680694\n";

const proc = spawn('ssh', ['-o', 'BatchMode=yes', 'root@162.243.197.241', 'cat >> ~/.ssh/authorized_keys']);

proc.stdin.write(key);
proc.stdin.end();

proc.stdout.on('data', d => console.log('STDOUT:', d.toString()));
proc.stderr.on('data', d => console.error('STDERR:', d.toString()));

proc.on('close', code => {
  console.log('Finished with exit code:', code);
  process.exit(code);
});
