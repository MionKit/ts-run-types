# -----------------------------------------------------------------------------
# pm/apt.sh - apt installers (Debian/Ubuntu). Source me, do not execute.
# -----------------------------------------------------------------------------

PM_NAME="apt"

_apt_install() { $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@"; }

install_podman() { _apt_install podman; }

install_node()   { _apt_install nodejs npm; }

install_pnpm()   { install_pnpm_common; }

install_go()     { install_go_linux_tarball; }
