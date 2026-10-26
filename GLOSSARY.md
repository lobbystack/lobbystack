# LobbyStack

LobbyStack answers businesses' phone calls and website chats with an AI receptionist. Some businesses buy from LobbyStack directly, and others buy from a partner that resells LobbyStack under its own brand.

## Language

### Who

**Business**:
An organization whose calls and website chats LobbyStack answers. It belongs to the host directly or to a partner.
_Avoid_: Client, tenant, customer

**Partner**:
A company that resells LobbyStack to businesses under its own brand, domain, and bills. It keeps the businesses it sets up.
_Avoid_: Agency, reseller, white-label partner

**Partner member**:
A person on a partner's team, as its owner, an admin, or a member.
_Avoid_: Partner staff, agency user

**Host**:
The company that runs a LobbyStack deployment: LobbyStack on its cloud, or a self-hoster on its own. The host's brand appears on its main domain and is the verified sender of its texts.
_Avoid_: Operator, platform, deployment owner

**Operator**:
A person on a business's team who uses its dashboard.
_Avoid_: User, staff, host

**Affiliate**:
A person who refers businesses to LobbyStack for a commission. An affiliate never manages the businesses it refers.
_Avoid_: Partner, referrer

### What gets sold

**Plan**:
What the host sells to a business directly, such as LobbyStack's Starter or Pro.
_Avoid_: Tier, package

**Tier**:
What a partner buys from the host: a monthly fee and a pool.
_Avoid_: Plan, partner plan

**Pool**:
The minutes and chats a partner's tier includes each month, shared by all the partner's businesses. On a deployment that bills no tiers, the host sets the pool, or leaves it with no limit.
_Avoid_: Credits, allowance

**Package**:
What a partner sells to one of its businesses: a price and an allowance.
_Avoid_: Plan, partner plan

**Allowance**:
The minutes and chats a business's plan or package includes each month.
_Avoid_: Pool, credits, quota

### Moving businesses

**Platform key**:
An API key that can create businesses and then manage them. A partner makes its own, and the host holds the rest.
_Avoid_: Partner key

**Claim**:
A business's owner taking over a business someone set up for them with a platform key, through a claim link. The owner then pays the host directly.
_Avoid_: Handoff, transfer

**Release**:
A partner giving one of its businesses to that business's owner, who then pays the host directly.
_Avoid_: Transfer, offboarding
