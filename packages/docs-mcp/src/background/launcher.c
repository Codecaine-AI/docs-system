#include <mach-o/dyld.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <limits.h>

int main(void) {
  char executable[PATH_MAX], resolved[PATH_MAX], runtime[PATH_MAX], script[PATH_MAX];
  uint32_t size = sizeof(executable);
  if (_NSGetExecutablePath(executable, &size) != 0 || !realpath(executable, resolved)) return 1;
  char *slash = strrchr(resolved, '/');
  if (!slash) return 1;
  *slash = '\0';
  snprintf(runtime, sizeof(runtime), "%s/bun", resolved);
  snprintf(script, sizeof(script), "%s/../Resources/bootstrap.mjs", resolved);
  char *args[] = { runtime, script, NULL };
  execv(runtime, args);
  perror("Unable to start Codecaine Docs");
  return 1;
}
