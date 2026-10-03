#!/usr/bin/env bash
# Run on the z.com server over SSH BEFORE the first deploy:  bash check-host.sh [smtp-host]
# Checks the things that decide whether the HR app will run well on the shared plan.
SMTP_HOST="${1:-mail.$(hostname -d 2>/dev/null)}"
NODE=/opt/alt/alt-nodejs22/root/usr/bin/node

echo "== Node 22 (needs >= 22.12.0) =="
if [ -x "$NODE" ]; then "$NODE" -v; else echo "MISSING: $NODE — pick Node 22 in 'Setup Node.js App' or ask support"; fi

echo; echo "== glibc (needs >= 2.18 for the SQLite driver) =="
ldd --version | head -1

echo; echo "== Home filesystem (SQLite WAL needs a local disk; 'nfs' means set HR_SQLITE_WAL=false) =="
stat -f -c %T "$HOME"

echo; echo "== CloudLinux resource limits (memory = PMEM/VMEM, processes = NPROC/EP) =="
if [ -r /proc/lve/list ]; then cat /proc/lve/list | head -3; fi
cat /proc/self/cgroup 2>/dev/null | head -3
ulimit -a 2>/dev/null | grep -Ei "virtual|processes|open files"
echo "Tip: cPanel → 'Resource Usage' shows the physical memory limit. The app needs ~350–500 MB."

echo; echo "== Disk & inode quota (the app uses ~45k files) =="
quota -s 2>/dev/null || echo "(quota command not available — check cPanel → Disk Usage / File Usage)"

echo; echo "== Outbound SMTP to $SMTP_HOST (for password-reset emails) =="
for port in 465 587; do
  if timeout 5 bash -c "</dev/tcp/$SMTP_HOST/$port" 2>/dev/null; then echo "port $port: open"; else echo "port $port: blocked/unreachable"; fi
done

echo; echo "== Test the SQLite driver with Node 22 =="
if [ -x "$NODE" ] && [ -d "$HOME/hr-app/node_modules/libsql" ]; then
  (cd "$HOME/hr-app" && "$NODE" -e "const D=require('libsql');const d=new D(':memory:');console.log('libsql OK, SQLite', d.prepare('select sqlite_version() v').get().v)")
else
  echo "(run again after uploading the release to ~/hr-app)"
fi
