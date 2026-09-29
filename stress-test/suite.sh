#!/usr/bin/env bash
# Fixed stress-test suite used to verify that engine changes are behavior-preserving.
#
#   bash stress-test/suite.sh record   # write baselines (run on the known-good engine)
#   bash stress-test/suite.sh compare  # rerun everything, compare fingerprints to the baselines
#
# Configs run in parallel, so per-run timings in the logs are not meaningful here;
# use the stress-test directly for performance measurements.
set -uo pipefail

MODE="${1:-compare}"
BASELINES="stress-test/baselines"
LOGS="stress-test/results/suite"
RUNNER="dist-stress-test/stress-test/stress-test.js"

RANDOM_A="--tileset random --random-tiles 32 --random-labels 6 --width 10 --height 10"
RANDOM_B="--tileset random --random-tiles 32 --random-labels 8 --width 10 --height 10"

CONFIGS=(
  "iso-10x15-conservative|--runs 1000"
  "iso-10x15-aggressive|--runs 300 --strategy aggressive"
  "iso-10x15-deep|--runs 300 --strategy deep"
  "iso-20x30-conservative|--runs 50 --width 20 --height 30"
  "random-a-conservative|$RANDOM_A --runs 1000"
  "random-a-aggressive|$RANDOM_A --runs 1000 --strategy aggressive"
  "random-a-deep|$RANDOM_A --runs 1000 --strategy deep"
  "random-b-conservative|$RANDOM_B --runs 1000"
  "random-b-deep|$RANDOM_B --runs 1000 --strategy deep"
)

if [[ "$MODE" != "record" && "$MODE" != "compare" ]]; then
  echo "Usage: $0 record|compare"
  exit 1
fi

mkdir -p "$BASELINES" "$LOGS"
pids=()
names=()

for entry in "${CONFIGS[@]}"; do
  name="${entry%%|*}"
  args="${entry#*|}"
  if [[ "$MODE" == "record" ]]; then
    extra="--output $BASELINES/$name.json"
  else
    if [[ ! -f "$BASELINES/$name.json" ]]; then
      echo "Missing baseline $BASELINES/$name.json - run '$0 record' on the known-good engine first"
      exit 1
    fi
    extra="--compare $BASELINES/$name.json --output $LOGS/$name.json"
  fi
  # shellcheck disable=SC2086
  node "$RUNNER" --quiet --fast --allow-failures $args $extra >"$LOGS/$name.log" 2>&1 &
  pids+=($!)
  names+=("$name")
done

status=0
for i in "${!pids[@]}"; do
  name="${names[$i]}"
  if wait "${pids[$i]}"; then
    result="PASS"
  else
    result="FAIL"
    status=1
  fi
  summary=$(grep -E "^(Runs:|Invalid solutions|Compare vs)" "$LOGS/$name.log" | sed "s|$BASELINES/||" | tr '\n' ' ')
  printf "%-26s %s  %s\n" "$name" "$result" "$summary"
done

exit $status
