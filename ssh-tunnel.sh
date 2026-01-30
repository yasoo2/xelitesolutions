#!/bin/bash
expect <<EOF
set timeout 15
spawn ssh -o StrictHostKeyChecking=no -L 27017:localhost:27017 root@46.224.187.142 -N
expect {
    "password:" {
        send "Younes.sowady2011\r"
        exp_continue
    }
    "Permission denied" {
        send_user "Authentication failed\n"
        exit 1
    }
    timeout {
        send_user "Connection timed out\n"
        exit 1
    }
}
EOF
