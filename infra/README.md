# infra

**Nothing in this directory is deployed.** roamr runs on Vercel, with Supabase
Cloud as the data layer, and deploying is still a `git push`. This is the
*prepared* Kubernetes path, kept honest by CI so that moving to a cluster later
is a config change rather than a rewrite.

That distinction is the whole reason the directory exists. Infrastructure code
that has never been rendered, validated or read is not a migration plan — it is
a guess that will be discovered to be wrong at the worst possible moment. So
everything here is linted, templated and schema-validated on every change by
[`.github/workflows/infra.yml`](../.github/workflows/infra.yml), even though no
cluster consumes it.

## What is here

```
helm/roamr-web/     Helm chart for the stateless web app (start here)
k8s/base/           The same thing as plain manifests, for Kustomize users
k8s/overlays/       staging and production
```

Two ways to deploy the same workload, deliberately. The chart is the primary
artifact; the Kustomize tree exists because Argo CD and Flux users often prefer
plain manifests, and because a second hand-written expression of the same
deployment catches assumptions the chart's defaults quietly bury.

They are hand-maintained mirrors, not generated output. Change a probe, a
security context or a resource value in one and change it in the other — CI
validates both but cannot tell you they have drifted apart in meaning.

## What is deliberately NOT here

### Terraform

There is no Terraform, and its absence is a decision rather than an oversight.

No cloud account has been chosen. The stack is Supabase + Vercel, and neither
AWS nor GCP is provisioned or being provisioned. Writing several hundred lines
of EKS/GKE/VPC/IAM code today would produce something nobody can apply, nobody
can review against a real account, and CI cannot test beyond `terraform
validate` — which proves only that the HCL parses. That is worse than an empty
directory: it looks like working infrastructure, it accumulates drift against
provider API changes, and the first person to run `terraform apply` inherits
every wrong assumption at once.

The chart is cloud-agnostic on purpose. It needs a Kubernetes API, an ingress
controller and a registry — nothing provider-specific. The cloud-specific layer
gets written when a provider is actually picked, against an account that exists,
and it will be a smaller diff than the guesswork would have been.

(`CLAUDE.md` lists `infra/` as "Helm chart, k8s manifests, Terraform" — the
Terraform part is this deferral, not a missing file.)

### Anything stateful

No Postgres, no GoTrue, no PostgREST, no Storage, no PVCs, no StatefulSets.

Postgres, Auth and Storage stay managed in Supabase Cloud. Only the stateless
Next.js app is containerized and orchestrated, and that split is the point:
the tier that scales horizontally, restarts freely and can be killed at any
moment is separated from the tier that holds the data and needs backups,
point-in-time recovery, connection pooling and careful upgrades. Self-hosting
the Supabase stack means owning all of that — for a friends-first app whose
entire operational budget is one person's spare evenings, it is the wrong
trade.

The visible consequence is in `networkpolicy.yaml`: the load-bearing rule is
*egress to 443*, not a selector pointing at a database pod. The data layer is
off-cluster, and the manifests say so.

## Why the app is already cluster-ready

None of this required changes to the app in this PR — it was built this way:

| Piece | Where |
|---|---|
| Standalone server bundle (no `node_modules` at runtime) | `web/next.config.ts` — `output: "standalone"` |
| Non-root multi-stage image, UID 1001 | `web/Dockerfile` |
| `/healthz` — liveness, zero dependencies | `web/src/app/healthz/route.ts` |
| `/readyz` — readiness, checks Supabase | `web/src/app/readyz/route.ts` |
| 12-factor config, validated at startup | `web/src/lib/env.ts` |

## Cutover checklist

What would actually have to happen to move off Vercel. Roughly in order; none
of it is done.

- [ ] **Registry.** Pick one (GHCR is the obvious default given the repo is on
      GitHub) and give the cluster pull access. Update `image.repository`.
- [ ] **Publish images.** `.github/workflows/ci.yml` builds the image but does
      not push it. Add a push step tagged with the git SHA, and prefer a digest
      in production — a tag can be moved, a digest cannot.
- [ ] **Decide the `NEXT_PUBLIC_*` build matrix.** These are baked into the
      client bundle at build time, so staging and production need *separate
      image builds*, not just separate ConfigMaps. This is the single most
      likely thing to be got wrong; see the chart README.
- [ ] **Create the Secret** in each namespace, out of band:
      `kubectl -n roamr create secret generic roamr-web --from-literal=SUPABASE_SERVICE_ROLE_KEY=...`
      Never in a values file, never in git. Decide whether it is managed by
      hand, External Secrets, or Sealed Secrets.
- [ ] **Ingress controller + TLS.** Install ingress-nginx (or equivalent) and
      cert-manager with a real ClusterIssuer, then set `ingress.enabled=true`
      and the `tls` block.
- [ ] **DNS.** Point the record at the ingress load balancer. Set
      `config.siteUrl` to match — magic-link redirects break loudly otherwise.
- [ ] **Supabase allowlists.** Add the new origin to the Supabase project's
      redirect URL allowlist and to any Mapbox token origin restriction.
- [ ] **Metrics server.** The HPA scales on CPU and needs `metrics-server`
      installed, or it sits at `<unknown>/70%` forever.
- [ ] **Confirm the CNI enforces NetworkPolicy** before treating
      `networkPolicy.enabled=true` as a control. Objects are accepted with no
      warning on a CNI that ignores them.
- [ ] **Pod Security Standards.** Label the namespace
      `pod-security.kubernetes.io/enforce=restricted`. The manifests already
      satisfy it unmodified; the label is what makes that enforced rather than
      aspirational.
- [ ] **Run it in parallel first.** Keep Vercel serving production until the
      cluster has held real traffic. Cut DNS over last, and keep the Vercel
      project until you are sure.

## Validating locally

Host tools; no Docker and no cluster required.

```bash
brew install helm kubeconform kustomize

helm lint infra/helm/roamr-web
helm template roamr infra/helm/roamr-web | kubeconform -strict -summary

# The optional templates -- Ingress, HPA, NetworkPolicy, Secret reference --
# are only rendered with the CI values file.
helm lint infra/helm/roamr-web -f infra/helm/roamr-web/ci/full-values.yaml
helm template roamr infra/helm/roamr-web \
  -f infra/helm/roamr-web/ci/full-values.yaml | kubeconform -strict -summary

kustomize build infra/k8s/overlays/staging    | kubeconform -strict -summary
kustomize build infra/k8s/overlays/production | kubeconform -strict -summary
```

`kubeconform` checks manifests against the Kubernetes OpenAPI schemas. `-strict`
rejects unknown fields, which is what catches the typo'd key that would
otherwise be silently ignored by the API server.
