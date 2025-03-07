#!/bin/bash
# 这个脚本将为您的 Debian 系统安装 curl、docker，然后更改时间区域，启用 BBR，并安装 Python

# 更新系统
echo "——————————开始更新系统..."
apt update && apt upgrade -y && apt dist-upgrade -y && apt full-upgrade -y && apt autoremove -y &&
echo "——————————完成更新系统"



# 安装 curl 
echo "——————————开始安装 curl，screen等 "
sudo apt install -y vim git curl screen htop vnstat net-tools dnsutils sudo unzip
echo "——————————完成安装 curl "



# 开启 bbr
echo "——————————开始启用 bbr..."
sudo bash -c 'echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf'
sudo bash -c 'echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf'
sudo sysctl -p
lsmod | grep bbr
echo "——————————完成启用 bbr"

# 安装 Python 3 和 pip
echo "——————————开始安装 Python 3 和 pip..."
sudo apt-get install -y python3 python3-pip
echo "——————————完成安装 Python 3 和 pip"



# 安装 docker
echo "——————————开始安装 docker..."
curl -fsSL https://get.docker.com | bash -s docker
echo "——————————完成安装 docker"



# 修改系统时区为 Asia/Shanghai，并且给history增加时间
echo "——————————开始修改系统时区为 Asia/Shanghai"
cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
date -R
echo "——————————完成时区修改"

echo "——————————开始修改history"
echo 'HISTTIMEFORMAT="%F %T "' >> /etc/profile
source /etc/profile
history | tail -n 5
echo "——————————完成history修改"



: '
# 安装 Rclone
echo "——————————开始安装 Rclone..."
sudo -v ; curl https://rclone.org/install.sh | sudo bash
apt install fuse3
echo "——————————完成安装 Rclone"


# 安装 fail2ban
echo "——————————开始安装 fail2ban..."
apt install fail2ban -y
echo "——————————完成安装 fail2ban"

'

