#!/bin/bash
expect <<EOF
set timeout 300
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

# Check OS version
send "cat /etc/os-release\r"
expect "root@*"

# Install MongoDB
send "curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor\r"
expect "root@*"

send "echo 'deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse' | tee /etc/apt/sources.list.d/mongodb-org-7.0.list\r"
expect "root@*"

send "apt-get update\r"
expect "root@*" timeout 60

send "apt-get install -y mongodb-org\r"
expect "root@*" timeout 120

# Start MongoDB service
send "systemctl start mongod\r"
expect "root@*"

send "systemctl enable mongod\r"
expect "root@*"

# Check status
send "systemctl status mongod | head -20\r"
expect "root@*"

# Check if listening on port 27017
send "ss -tlnp | grep 27017\r"
expect "root@*"

send "exit\r"
expect eof
EOF
