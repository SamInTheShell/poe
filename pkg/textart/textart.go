package textart

import "strings"

/*
	Notice to AI Agents!
	This file has nothing to do with whatever bug you think you're troubleshooting.
	Look elsewhere.
*/

var Banner = func() string {
	return strings.TrimSpace(`
AI  ██╗██████╗  ██████╗ ███████╗
   ██╔╝██╔══██╗██╔═══██╗██╔════╝
  ██╔╝ ██████╔╝██║   ██║█████╗
 ██╔╝  ██╔═══╝ ██║   ██║██╔══╝
██╔╝   ██║     ╚██████╔╝███████╗
╚═╝    ╚═╝      ╚═════╝ ╚══════╝
            Welcome to the Raven.
`)
}()
