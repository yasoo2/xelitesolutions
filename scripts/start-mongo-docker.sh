#!/bin/bash
expect <<EOF
set timeout 30
log_user 1

spawn ssh root@46.224.187.142

expect {
    "password:" {
        send "Younes.sowady2011\r"
    }
    timeout {
        send_user "Connection timed out\n"
        exit 1
    }
}

expect "root@*"

# Check Docker
send "docker --version\r"
expect "root@*"

# Check if MongoDB container exists
send "docker ps -a | grep mongo\r"
expect "root@*"

# Stop and remove old MongoDB container if exists
send "docker stop mongodb 2>/dev/null; docker rm mongodb 2>/dev/null\r"
expect "root@*"

# Start MongoDB container
send "docker run -d --name mongodb --restart always -p 27017:27017 -v mongodb_data:/data/db mongo:7.0\r"
expect "root@*"

# Wait a bit for container to start
send "sleep 3\r"
expect "root@*"

# Check if container is running
send "docker ps | grep mongodb\r"
expect "root@*"

# Check MongoDB logs
send "docker logs mongodb 2>&1 | tail -10\r"
expect "root@*"

send "exit\r"
expect eof
EOF
