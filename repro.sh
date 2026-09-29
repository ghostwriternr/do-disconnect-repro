#!/usr/bin/env bash
# Usage: ./repro.sh <deployed-worker-url>
#
# For each route, curl starts a 3 s run and disconnects after 1.2 s. Once the
# run would have finished, the script prints the log for that run.
set -uo pipefail

BASE="${1:?usage: ./repro.sh <deployed-worker-url>}"
PREFIX="$(date +%s)"

for route in worker rpc fetch; do
	id="${PREFIX}-${route}"
	echo "=== /${route}"
	curl -sS --max-time 1.2 "${BASE}/${route}?run=${id}" >/dev/null 2>&1
	sleep 5
	curl -sS "${BASE}/status?run=${id}"
	echo
done
