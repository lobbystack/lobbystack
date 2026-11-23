# Terraform guidelines

This directory provisions the SIP server (an Azure VM that runs `docker/asterisk`). `README.md` explains how to use it. This file explains how to write more of it. Follow the patterns that already exist here.

## Layout

```
main.tf            Wires the modules together. No resource blocks.
locals.tf          Values the modules share: tags, rules, cloud-init.
data.tf            Data sources.
variables.tf       Root variables.
providers.tf       Terraform and provider versions, provider settings.
outputs.tf         Root outputs.
environments/      One .tfvars file per environment: dev, sandbox, prod.
modules/<name>/    One module per Azure resource type: locals.tf, main.tf, outputs.tf, variables.tf.
templates/         *.tftpl files read by templatefile().
scripts/python/    deploy.py, start.py and stop.py. Run Terraform through these.
```

Every file stays in its slot. A new value shared by modules goes in the root `locals.tf`, not in `main.tf`.

## Modules

- A module is named after its resource type without the `azurerm_` prefix: `azurerm_virtual_network` lives in `modules/virtual_network`.
- A module creates only that resource type. Nothing else goes in it, not a helper resource and not a data source for another type.
- The resource is always named `this`, so its address is `module.<name>.azurerm_<type>.this`.
- Every module has all four files, even when `locals.tf` holds only a comment.
- `locals.tf` holds what the module decides itself: the resource's name and the settings that never differ, such as an address range, a SKU or an image. `variables.tf` holds only what the caller supplies: the common values (`app_name`, `environment`, `location`, `resource_group_name`, `tags`) and ids or names from other modules. Don't add a variable for a value nobody overrides.
- Variables carry a `description` and a `type`. Give a default only when one value is right almost everywhere. Add `validation` blocks for rules Azure would reject late, such as a priority range.
- Outputs expose what other modules need, usually `id` and `name`, and add a `description`.
- Wire modules in `main.tf` through outputs (`module.resource_group.name`), never by retyping a name.
- To add a resource type, copy the smallest existing module, such as `modules/network_security_group`, and call it from `main.tf`.

## Naming

Every resource name is built in its module's `locals.tf` from `app_name`, the resource type and the environment, and `main.tf` reads `local.name`:

```hcl
name = join("-", compact([
  var.app_name,
  "{resource_type}",
  var.environment,
]))
```

`{resource_type}` is the module's name with hyphens, for example:

```hcl
name = join("-", compact([
  var.app_name,
  "virtual-network",
  var.environment,
]))
```

The module declares `app_name` and `environment` as variables and the root `main.tf` passes them in. Don't pass a finished `name` into a module that follows this pattern.

Exception: `network_security_rule` names each rule by its key in the `rules` map.

`resource_group`, `virtual_network`, `subnet`, `public_ip`, `network_security_group`, `network_interface` and `linux_virtual_machine` all follow this pattern. Their tokens are `resource-group`, `virtual-network`, `subnet`, `public-ip`, `network-security-group`, `network-interface` and `linux-virtual-machine`. A new module that names its resource does the same.

Azure can't rename a resource. A new name replaces the resource, and the public IP changes with it, so a carrier's routing breaks. Run a plan, read what it will destroy, and ask before you change a name that exists in an environment.

## Variables and environments

- Values that differ per environment go in `environments/<env>.tfvars`. Values that are secret go in `terraform.tfvars`, which is gitignored (`terraform.tfvars.example` shows the shape).
- Each environment has its own Azure subscription and its own resource group. `dev` and `sandbox` use the NPD subscription, `prod` uses PRD. Never fall back from one to another.
- `subscription_id` must be a GUID. `prod.tfvars` holds a placeholder that stops every prod command until someone sets it.
- Every variable in `variables.tf` has a `description` and a `type`. Mark credentials and keys `sensitive = true`.
- Tags come from `local.tags`. Pass them to every resource that takes tags.

## Secrets and state

- State, saved plans and `terraform.tfvars` hold secrets. They are gitignored. Never commit them, print them or paste them into a reply.
- Don't put an IP address, key, project id or password in a committed file unless it is public (such as a carrier's published range).

## Style

- Run `terraform fmt -recursive` before you finish. It aligns `=` and fixes indentation. It leaves blank lines alone, so keep one blank line between blocks.
- Comments explain why, not what. Write them in plain sentences.
- Use `for_each` over a map for a set of similar resources, with a stable key. Don't use `count` for that, because removing an item shifts the rest.
- Use `moved` blocks in `main.tf` when you rename or relocate a resource, so Terraform adopts what exists. Delete a block once every state has applied it.
- Copy that the user reads, such as `error_message`, follows the writing rules in the repository's `AGENTS.md`.

## Working on it

- Run Terraform through `scripts/python/deploy.py` (menu: Plan, Apply, Drift, Destroy, Import, Init). It picks the subscription and workspace for the environment, so you never choose them by hand.
- `start.py` and `stop.py` start and deallocate a VM. `stop.py prod` asks for confirmation.
- Check a change with `terraform fmt -check -recursive` and a plan against `dev`.
- Don't apply, destroy or import unless the user asks. A plan is always safe to run.
- Update `README.md` when you change the layout, an environment or a command it describes.

## Keeping this file current

This file describes the code as it is. Treat it as part of the loop: write code, check it against this file, then fix whichever one is wrong.

- Before you start, read the file. If a section disagrees with the code, trust the code and fix the section in the same change.
- Update this file in the same change when you:
  - add, rename or remove a module, a root file, an environment or a script
  - change the naming pattern, the variable rules or the tag rules
  - add a module that names its resource (then add its token to the list in Naming)
  - delete a `moved` block, or find a mistake that a rule here would have prevented
- When you repeat the same correction twice, or a reviewer asks for the same fix again, add a rule for it. Write the rule as an instruction, with the reason when it isn't obvious.
- Remove rules that no longer apply. A list that only grows stops being read.
- Keep the file short. Link to `README.md` for how to use the setup, and put only how to write code here.
- Run the check at the end of every task that touches this directory: list the modules (`ls modules`), compare them with the Layout and Naming sections, and fix any difference.
