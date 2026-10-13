{{/*
Expand the name of the chart.
*/}}
{{- define "roamr-web.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name. Truncated to 63 chars because some Kubernetes name
fields are limited to that by the DNS label spec.
*/}}
{{- define "roamr-web.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version, as used by the standard helm.sh/chart label.
*/}}
{{- define "roamr-web.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Selector labels. These land in a Deployment's immutable `selector` field, so
they must stay minimal and must never include anything that changes between
releases (a version or a chart label here makes every upgrade a replace).
*/}}
{{- define "roamr-web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "roamr-web.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Full label set for object metadata.
*/}}
{{- define "roamr-web.labels" -}}
helm.sh/chart: {{ include "roamr-web.chart" . }}
{{ include "roamr-web.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/component: web
app.kubernetes.io/part-of: roamr
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Annotations applied to every object.
*/}}
{{- define "roamr-web.annotations" -}}
{{- with .Values.commonAnnotations }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
ServiceAccount name to use.
*/}}
{{- define "roamr-web.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "roamr-web.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Fully qualified image reference. A digest, when given, wins over the tag --
pinning by digest is the only way to be certain every replica of a rollout is
running byte-identical code.
*/}}
{{- define "roamr-web.image" -}}
{{- if .Values.image.digest }}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest }}
{{- else }}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}
{{- end }}
