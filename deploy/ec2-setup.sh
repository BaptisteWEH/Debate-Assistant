#!/bin/bash
# Run this once on a fresh Ubuntu 22.04 EC2 instance (t3.micro works fine).
# Usage: bash ec2-setup.sh

set -e

echo "=== Installing system packages ==="
sudo apt-get update -y
sudo apt-get install -y python3-pip python3-venv nginx certbot python3-certbot-nginx git

echo "=== Cloning repo ==="
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git app
cd app

echo "=== Python venv ==="
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install faiss-cpu uvicorn[standard]

echo "=== Copy .env ==="
cp backend/.env.example backend/.env
echo ">>> Edit backend/.env with your real values before starting the service"

echo "=== Systemd service ==="
sudo cp deploy/debatecoach.service /etc/systemd/system/debatecoach.service
sudo systemctl daemon-reload
sudo systemctl enable debatecoach
sudo systemctl start debatecoach

echo "=== Nginx config ==="
sudo cp deploy/nginx.conf /etc/nginx/sites-available/debatecoach
sudo ln -sf /etc/nginx/sites-available/debatecoach /etc/nginx/sites-enabled/debatecoach
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=== Done! Next steps ==="
echo "1. Edit /home/ubuntu/app/backend/.env with real LUXIA_API_KEY, SMTP, etc."
echo "2. Point your domain DNS A record to this EC2's Elastic IP"
echo "3. Run: sudo certbot --nginx -d yourdomain.com"
echo "4. Update FRONTEND_URL in .env to https://your-vercel-app.vercel.app"
echo "5. sudo systemctl restart debatecoach"
