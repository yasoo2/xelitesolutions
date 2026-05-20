mkdir -p /root/quarantine_systemp
cp -p /usr/local/bin/systemp /root/quarantine_systemp/ 2>/dev/null
cp -p /usr/local/bin/.config.json /root/quarantine_systemp/ 2>/dev/null
cp -p /usr/local/bin/free_proc.sh /root/quarantine_systemp/ 2>/dev/null
cp -p /usr/local/bin/.bench.log /root/quarantine_systemp/ 2>/dev/null
cp -p /etc/systemd/system/systemp.service /root/quarantine_systemp/ 2>/dev/null
tar -czvf /root/quarantine_systemp.tar.gz -C /root quarantine_systemp

systemctl stop systemp
systemctl disable systemp
pkill -9 -f "systemp"
pkill -9 -f "free_proc.sh"

rm -f /etc/systemd/system/systemp.service
rm -f /usr/local/bin/systemp /usr/local/bin/.config.json /usr/local/bin/free_proc.sh /usr/local/bin/.bench.log
systemctl daemon-reload
systemctl reset-failed

sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

echo "--- PROCESS CHECK ---"
ps -ef | grep -iE "systemp|xmrig" | grep -v grep
echo "--- NETWORK CHECK ---"
ss -tunap | grep -E "8029|systemp|xmrig"
echo "--- SSH CONFIG CHECK ---"
grep -E "^PermitRootLogin|^PasswordAuthentication" /etc/ssh/sshd_config
