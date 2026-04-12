# Security Policy

## Supported Branch

- `main`

## Reporting A Vulnerability

Do not open public issues for:

- secrets exposure
- auth or governance bypass
- data exfiltration paths
- unsafe actuation behavior
- benchmark publication leaks

Use GitHub private vulnerability reporting for the repository once enabled, or
contact the maintainer privately through the project profile links. Include:

- affected component
- reproduction steps
- impact
- suggested containment if known

## Security Boundaries

Immaculate is designed around sensitive surfaces:

- neurodata and derived neural features
- cognitive traces and model outputs
- actuation commands and device transports
- benchmark publications and external telemetry

Contributions that weaken purpose binding, redaction, auth, fault isolation, or
auditability will be rejected.
