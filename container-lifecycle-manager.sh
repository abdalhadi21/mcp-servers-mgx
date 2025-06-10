#!/bin/bash

# Container Lifecycle Manager - Pause containers after 30 minutes of inactivity
# Usage: ./container-lifecycle-manager.sh

set -euo pipefail

# Configuration
CONTAINERS=("mcp-sequentialthinking" "mcp-web-fetcher" "mcp-duckduckgo" "mcp-time" "mcp-youtube-transcript")
INACTIVITY_THRESHOLD=1800  # 30 minutes in seconds
STATE_DIR="/tmp/mcp-lifecycle"
LOG_FILE="/var/log/mcp-lifecycle.log"

# Create state directory
mkdir -p "$STATE_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get container network bytes
get_network_bytes() {
    local container=$1
    local stats
    
    if ! stats=$(docker stats "$container" --no-stream --format "table {{.NetIO}}" 2>/dev/null | tail -n +2); then
        echo "0"
        return
    fi
    
    # Extract total bytes (input + output) from format like "1.23MB / 4.56MB"
    echo "$stats" | sed 's/[^0-9.]//g' | awk -F'/' '{print $1 + $2}' | head -1
}

# Check if container is paused
is_paused() {
    local container=$1
    docker inspect "$container" --format '{{.State.Paused}}' 2>/dev/null || echo "false"
}

# Check if container is running
is_running() {
    local container=$1
    docker inspect "$container" --format '{{.State.Running}}' 2>/dev/null || echo "false"
}

# Pause container
pause_container() {
    local container=$1
    if [[ "$(is_running "$container")" == "true" ]] && [[ "$(is_paused "$container")" == "false" ]]; then
        log "Pausing $container due to inactivity"
        docker pause "$container"
        return 0
    fi
    return 1
}

# Unpause container
unpause_container() {
    local container=$1
    if [[ "$(is_paused "$container")" == "true" ]]; then
        log "Unpausing $container due to activity"
        docker unpause "$container"
        return 0
    fi
    return 1
}

# Main monitoring loop
monitor_containers() {
    for container in "${CONTAINERS[@]}"; do
        # Skip if container doesn't exist or isn't running
        if ! docker inspect "$container" >/dev/null 2>&1; then
            continue
        fi
        
        local state_file="$STATE_DIR/$container"
        local current_bytes
        local last_bytes=0
        local last_activity_time
        
        current_bytes=$(get_network_bytes "$container")
        
        # Read previous state
        if [[ -f "$state_file" ]]; then
            read -r last_bytes last_activity_time < "$state_file"
        else
            last_activity_time=$(date +%s)
        fi
        
        # Check for activity (network traffic change)
        if [[ "$current_bytes" != "$last_bytes" ]]; then
            # Activity detected
            last_activity_time=$(date +%s)
            log "Activity detected on $container (${current_bytes} bytes)"
            
            # Unpause if currently paused
            unpause_container "$container"
        fi
        
        # Save current state
        echo "$current_bytes $last_activity_time" > "$state_file"
        
        # Check if should pause due to inactivity
        local current_time=$(date +%s)
        local inactive_time=$((current_time - last_activity_time))
        
        if [[ $inactive_time -gt $INACTIVITY_THRESHOLD ]]; then
            if pause_container "$container"; then
                log "$container paused after ${inactive_time}s of inactivity"
            fi
        else
            local remaining=$((INACTIVITY_THRESHOLD - inactive_time))
            log "$container active, ${remaining}s until auto-pause"
        fi
    done
}

# Handle incoming requests (webhook endpoint)
handle_request() {
    local container=$1
    log "Incoming request for $container"
    unpause_container "$container"
}

# Main execution
case "${1:-monitor}" in
    "monitor")
        monitor_containers
        ;;
    "unpause")
        if [[ -n "${2:-}" ]]; then
            handle_request "$2"
        else
            log "Error: Container name required for unpause"
            exit 1
        fi
        ;;
    "status")
        for container in "${CONTAINERS[@]}"; do
            if docker inspect "$container" >/dev/null 2>&1; then
                local running=$(is_running "$container")
                local paused=$(is_paused "$container")
                echo "$container: running=$running, paused=$paused"
            else
                echo "$container: not found"
            fi
        done
        ;;
    *)
        echo "Usage: $0 [monitor|unpause <container>|status]"
        exit 1
        ;;
esac