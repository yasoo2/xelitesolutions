#!/bin/bash
expect <<EOF
set timeout 15
spawn ssh root@46.224.187.142 "systemctl status mongod && ss -tlnp | grep 27017"
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
    eof
}
EOF
