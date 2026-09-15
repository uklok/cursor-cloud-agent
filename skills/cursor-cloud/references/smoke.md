# First-env smoke

Read this only when this registry env has not been smoked, or after boot / skills-path changes. Skip it on ordinary follow-ups.

1. `cursor_cloud_envs` (catalog from plugin init). `cursor_cloud_launch` may return `phase=choose` — ask the user, then recall. Reply if this session is already bound.
2. Otherwise `cursor_cloud_launch` with the registry env id. Omit `repo` unless that URL is in `allowRepos` (named cloud envs still omit it on the wire). Base envs clone; project envs use the loaded repo.
3. Prompt, in order: SSH hello → clone or fetch the target if it is not the env primary → read one file → use one org skill on demand (not only `ls`).
4. Record: workdir, whether skills loaded from the configured `skillsPath`, and the `bc-…`.
5. `cursor_cloud_reply` on that id: continue on the same workdir. Do not expect a second stream.

If skills landed under `~/.agents/skills` instead of the configured path, treat that as an env regression, not a coordinator bug.
