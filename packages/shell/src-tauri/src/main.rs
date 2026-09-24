// The shell: a window around the app, and nothing else. What the app is, is in ../../app;
// what it talks to, in ../../daemon. This file exists so the binary has an entry point.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lattice_lib::run();
}
