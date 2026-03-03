# targets_reference (Deprecated)

`targets_reference` documentation has been superseded by
`clinical_reference_rules`.

Use [clinical_reference_rules.md](./clinical_reference_rules.md) for all new
reference/rules modelling.

## Migration note

- Old `targets_reference.metric` maps to `clinical_reference_rules.code`
- Old target rows map to `kind = "clinical_target"` (or `"health_target"` where
  appropriate)
- Keep `targets_current` and `targets_ledger` unchanged as the target-state
  runtime collections
