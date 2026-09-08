# roamr-web Helm chart

Deploys the stateless roamr Next.js app. Postgres, Auth and Storage stay in
Supabase Cloud, so there is no StatefulSet, no PVC and no database here — see
[`infra/README.md`](../../README.md) for why that split is the whole point.

Nothing in this chart is deployed today; roamr ships to Vercel. It is validated
on every change by `.github/workflows/infra.yml`.

## Install

```bash
# 1. Create the Secret out of band. The chart never creates one and never takes
#    a secret value in a values file.
kubectl -n roamr create secret generic roamr-web \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY='...' \
  --from-literal=MAPBOX_ACCESS_TOKEN='...'

# 2. Install.
helm upgrade --install roamr infra/helm/roamr-web \
  --namespace roamr --create-namespace \
  --set image.tag=sha-abc1234 \
  --set secret.existingSecret=roamr-web \
  --set secret.mapboxTokenKey=MAPBOX_ACCESS_TOKEN \
  --set config.supabaseUrl=https://your-project.supabase.co \
  --set config.supabaseAnonKey=eyJ... \
  --set config.siteUrl=https://roamr.example.com \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=roamr.example.com
```

Requires Kubernetes >= 1.27.

## Two things that trip people up

### `NEXT_PUBLIC_*` is build-time, not runtime

`next build` inlines `process.env.NEXT_PUBLIC_*` into the client bundle (see the
`ARG` lines in `web/Dockerfile`). Changing `config.supabaseUrl` here does **not**
change what the browser talks to — only what the server reads.

They still have to be set at runtime, because `web/src/lib/env.ts` validates the
full server schema out of `process.env` on first use. So the values here must
*match* the build args the image was built with. A mismatch is silent: the
browser talks to one Supabase project and the server to another, and nothing in
the cluster reports a problem. To point the client somewhere else, rebuild the
image.

The one genuine secret, `SUPABASE_SERVICE_ROLE_KEY`, is runtime-only and must
never be a build arg — it bypasses row level security.

### Liveness vs. readiness

| Probe | Path | Touches Supabase | On failure |
|---|---|---|---|
| `startupProbe` | `/healthz` | no | kubelet keeps waiting (60s budget) |
| `livenessProbe` | `/healthz` | **no** | kubelet **restarts** the container |
| `readinessProbe` | `/readyz` | **yes** | pod leaves Service endpoints, keeps running |

Liveness must never reach Supabase. If it did, a Supabase blip would fail
liveness on every pod simultaneously, kubelet would restart all of them, and the
restarts would keep failing while the dependency was down — converting a
recoverable upstream problem into a self-inflicted CrashLoopBackOff. Readiness
failing is the correct response: pods stop taking traffic they cannot serve,
stay alive, and rejoin on their own.

`web/src/app/healthz/route.ts` is deliberately dependency-free for this reason;
`web/src/app/readyz/route.ts` is where the Supabase check lives.

## Values

### Image and identity

| Key | Default | Description |
|---|---|---|
| `replicaCount` | `2` | Pods when autoscaling is off. Ignored once `autoscaling.enabled` is true, so the HPA is not fought on every upgrade. |
| `image.repository` | `ghcr.io/adesai-24/roamr-web` | Registry and repository. No image is published yet. |
| `image.tag` | `""` | Defaults to `.Chart.AppVersion`. Use an immutable tag (a git SHA); with `latest`, a rescheduled pod can silently run a different build than its siblings. |
| `image.digest` | `""` | `sha256:…`. Wins over `tag` when set — the only way to be certain every replica runs identical code. |
| `image.pullPolicy` | `IfNotPresent` | |
| `imagePullSecrets` | `[]` | Existing `dockerconfigjson` secrets for private registries. |
| `nameOverride` | `""` | Overrides the chart-name part of generated names. |
| `fullnameOverride` | `""` | Overrides the full generated name. |
| `serviceAccount.create` | `true` | Create a dedicated ServiceAccount rather than using `default`. |
| `serviceAccount.name` | `""` | Generated from the fullname when empty. |
| `serviceAccount.annotations` | `{}` | e.g. an IRSA / Workload Identity binding. |
| `serviceAccount.automountServiceAccountToken` | `false` | The app never calls the Kubernetes API, so no cluster credential is projected into the container. |

### Configuration

| Key | Default | Description |
|---|---|---|
| `config.supabaseUrl` | `https://your-project.supabase.co` | Supabase project URL. **Must match the image's build arg.** |
| `config.supabaseAnonKey` | `""` | Anon key. Public by design — RLS, not secrecy, protects data behind it — so it lives in a ConfigMap, not a Secret. **Must match the image's build arg.** |
| `config.siteUrl` | `https://roamr.example.com` | Public origin. Used to build magic-link redirects, so a wrong value sends people to the wrong host after login. |
| `config.nodeEnv` | `production` | |
| `config.extraEnv` | `{}` | Extra plain env vars, as a map. |
| `config.extraEnvFrom` | `[]` | Extra `envFrom` sources mounted wholesale. |
| `secret.existingSecret` | `""` | Name of a **pre-existing** Secret holding server-only credentials. The chart never creates one: values files reach git, `helm get values` output and CI logs. Empty renders a Deployment without the service role key — allowed only so CI can render without a cluster. |
| `secret.serviceRoleKeyKey` | `SUPABASE_SERVICE_ROLE_KEY` | Key within that Secret. Bypasses RLS; server-only, never a build arg. |
| `secret.mapboxTokenKey` | `""` | Key within that Secret for `MAPBOX_ACCESS_TOKEN`. Empty omits the variable. |

### Networking

| Key | Default | Description |
|---|---|---|
| `service.type` | `ClusterIP` | |
| `service.port` | `80` | Port the Service listens on. |
| `service.targetPort` | `3000` | Container port. Matches `PORT` in `web/Dockerfile`. |
| `service.annotations` | `{}` | |
| `ingress.enabled` | `false` | |
| `ingress.className` | `nginx` | |
| `ingress.annotations` | `{}` | e.g. `cert-manager.io/cluster-issuer`. |
| `ingress.hosts` | one example host | List of `{host, paths: [{path, pathType}]}`. |
| `ingress.tls` | `[]` | `{secretName, hosts}` blocks. Each secret must exist or be issued by cert-manager. |

### Probes

| Key | Default | Description |
|---|---|---|
| `probes.liveness.enabled` | `true` | |
| `probes.liveness.path` | `/healthz` | Keep dependency-free — see above. |
| `probes.liveness.periodSeconds` / `timeoutSeconds` / `failureThreshold` / `successThreshold` / `initialDelaySeconds` | `10` / `3` / `3` / `1` / `0` | |
| `probes.readiness.enabled` | `true` | |
| `probes.readiness.path` | `/readyz` | Checks config and pings Supabase. |
| `probes.readiness.timeoutSeconds` | `5` | Above the handler's own 3s Supabase fetch timeout, so the handler reports the failure rather than the probe timing out first. |
| `probes.readiness.periodSeconds` / `failureThreshold` / `successThreshold` / `initialDelaySeconds` | `10` / `3` / `1` / `0` | |
| `probes.startup.enabled` | `true` | Suppresses liveness and readiness until it passes once, so a slow cold start is never mistaken for a crash loop. |
| `probes.startup.path` | `/healthz` | |
| `probes.startup.periodSeconds` / `failureThreshold` | `2` / `30` | 60s cold-start budget. |
| `probes.startup.initialDelaySeconds` / `timeoutSeconds` | `3` / `3` | |

### Resources, scaling and disruption

| Key | Default | Description |
|---|---|---|
| `resources.requests.cpu` | `100m` | What the scheduler packs against, and what HPA utilisation is a percentage of. |
| `resources.requests.memory` | `256Mi` | |
| `resources.limits.memory` | `512Mi` | Memory is not compressible, so it is capped. There is deliberately **no CPU limit**: CFS throttling on a latency-sensitive Node process costs more at p99 than the noisy-neighbour risk it removes. |
| `autoscaling.enabled` | `false` | |
| `autoscaling.minReplicas` / `maxReplicas` | `2` / `10` | |
| `autoscaling.targetCPUUtilizationPercentage` | `70` | Percentage of the CPU *request*. |
| `autoscaling.targetMemoryUtilizationPercentage` | `""` | Off by default: Node's heap grows to fill what it is given and rarely shrinks, so memory scales out under load and never scales back in. |
| `autoscaling.behavior` | up fast, down slow | 0s stabilisation up, 300s down. |
| `podDisruptionBudget.enabled` | `true` | Bounds voluntary disruption (drains, upgrades) only. The chart **fails to render** below 2 replicas: with one pod a PDB either blocks drains forever or permits total downtime. |
| `podDisruptionBudget.minAvailable` | `1` | |
| `podDisruptionBudget.maxUnavailable` | `""` | Set one or the other, not both. |
| `updateStrategy.maxUnavailable` | `0` | Capacity never dips during a deploy; a new pod must pass readiness before an old one goes. |
| `updateStrategy.maxSurge` | `1` | |
| `terminationGracePeriodSeconds` | `30` | Must exceed the preStop sleep plus the slowest in-flight request. |
| `lifecycle.preStop.enabled` | `true` | |
| `lifecycle.preStop.sleepSeconds` | `5` | Endpoint removal and pod termination are concurrent, not ordered. Without this, rolling updates return a burst of 502s. |

### Scheduling

| Key | Default | Description |
|---|---|---|
| `topologySpreadConstraints.enabled` | `true` | |
| `topologySpreadConstraints.constraints` | zone + hostname, `ScheduleAnyway` | A preference, not a requirement, so a single-zone cluster still schedules instead of leaving pods Pending. The production Kustomize overlay hardens zone spread to `DoNotSchedule`. |
| `nodeSelector` / `tolerations` / `affinity` / `priorityClassName` | empty | Standard passthroughs. |

### Security

| Key | Default | Description |
|---|---|---|
| `podSecurityContext` | `runAsNonRoot: true`, uid/gid/fsGroup `1001`, `seccompProfile: RuntimeDefault` | UID 1001 matches the `nextjs` user in `web/Dockerfile`. Changing one without the other makes the container unable to read its own files. |
| `securityContext` | `runAsNonRoot`, uid/gid `1001`, `allowPrivilegeEscalation: false`, `privileged: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]` | Satisfies the `restricted` Pod Security Standard with no exceptions. |
| `writableVolumes.nextCache.enabled` | `true` | `readOnlyRootFilesystem` is only survivable because of this. Next writes its ISR/fetch cache here on the first request and would otherwise crash on an EROFS. |
| `writableVolumes.nextCache.mountPath` | `/app/.next/cache` | |
| `writableVolumes.nextCache.sizeLimit` | `512Mi` | Capped so a runaway cache cannot exhaust node ephemeral storage. |
| `writableVolumes.tmp.*` | `/tmp`, `64Mi` | Node and sharp both write here. |
| `networkPolicy.enabled` | `false` | Default-deny plus explicit allowances. **Inert on a CNI that does not enforce NetworkPolicy** — the API server accepts it with no warning either way. |
| `networkPolicy.ingressFromNamespaceSelectors` | `ingress-nginx` | Namespaces allowed to reach the container port. |
| `networkPolicy.egress.dns` | `true` | Without it nothing resolves, and the failure looks like a Supabase outage. |
| `networkPolicy.egress.https` | `true` | Supabase Cloud and Mapbox are off-cluster over 443. Excludes RFC1918 and `169.254.0.0/16`, so an SSRF bug cannot reach cloud instance metadata and mint node IAM credentials. |
| `networkPolicy.extraIngress` / `extraEgress` | `[]` | Appended verbatim. |

### Metadata and extras

| Key | Default | Description |
|---|---|---|
| `commonLabels` / `commonAnnotations` | `{}` | Applied to every rendered object. |
| `podLabels` / `podAnnotations` | `{}` | Pod-only, e.g. a service mesh opt-in. |
| `extraVolumes` / `extraVolumeMounts` | `[]` | Beyond the writable ones above. |

## Validate locally

```bash
helm lint infra/helm/roamr-web
helm template roamr infra/helm/roamr-web | kubeconform -strict -summary
helm template roamr infra/helm/roamr-web \
  --values infra/helm/roamr-web/ci/full-values.yaml | kubeconform -strict -summary
```

`ci/full-values.yaml` switches on Ingress, the HPA, the NetworkPolicy and the
Secret reference — without it those four templates are never rendered at all.
It is excluded from the packaged chart by `.helmignore`.
