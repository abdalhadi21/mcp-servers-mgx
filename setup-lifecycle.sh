#!/bin/bash

# Setup script for MCP Container Lifecycle Management
# Run this on your VPS as root

set -euo pipefail

echo "Setting up MCP Container Lifecycle Management..."

# Make the main script executable
chmod +x container-lifecycle-manager.sh

# Copy script to system location
cp container-lifecycle-manager.sh /usr/local/bin/
chmod +x /usr/local/bin/container-lifecycle-manager.sh

# Update service file with correct path
sed -i 's|/path/to/container-lifecycle-manager.sh|/usr/local/bin/container-lifecycle-manager.sh|g' mcp-lifecycle.service

# Install systemd service
cp mcp-lifecycle.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable mcp-lifecycle.service

# Create log directory
mkdir -p /var/log
touch /var/log/mcp-lifecycle.log

# Start the service
systemctl start mcp-lifecycle.service

echo "✅ Lifecycle management setup complete!"
echo ""
echo "Commands:"
echo "  systemctl status mcp-lifecycle    # Check service status"
echo "  systemctl stop mcp-lifecycle      # Stop monitoring"
echo "  systemctl start mcp-lifecycle     # Start monitoring"
echo "  tail -f /var/log/mcp-lifecycle.log # View logs"
echo ""
echo "Manual commands:"
echo "  container-lifecycle-manager.sh status           # Check container status"
echo "  container-lifecycle-manager.sh unpause <name>   # Manual unpause"
echo ""
echo "🔧 Next steps:"
echo "1. Update nginx config with your domain and correct script path"
echo "2. Install nginx with lua support: apt install nginx-extras"
echo "3. Copy nginx-unpause.conf to /etc/nginx/sites-enabled/"
echo "4. Test with: systemctl reload nginx"