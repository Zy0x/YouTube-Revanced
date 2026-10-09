#!/system/bin/sh

PKGNAME=com.google.android.youtube

# Unmount all active YouTube mounts
grep "$PKGNAME" /proc/mounts 2>/dev/null | while read -r LINE; do
	MOUNT_POINT=$(echo "$LINE" | awk '{print $2}')
	if [ -n "$MOUNT_POINT" ]; then
		umount -l "$MOUNT_POINT" 2>/dev/null
	fi
done

# Restore clean stock app state
am force-stop "$PKGNAME" 2>/dev/null