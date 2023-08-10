#!/system/bin/sh

PKGNAME=com.google.android.youtube

# Unmount ReVanced
stock_path=$( pm path $PKGNAME | grep base | sed 's/package://g' )
if [[ '$stock_path' ]] ; then umount -l $stock_path; fi