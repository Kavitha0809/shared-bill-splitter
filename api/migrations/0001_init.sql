
CREATE TABLE homes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT homes_name_not_empty
        CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    member_order INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT members_home_fk
        FOREIGN KEY (home_id) REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT members_home_order_unique
        UNIQUE (home_id, member_order),

    CONSTRAINT members_order_positive
        CHECK (member_order > 0),

    CONSTRAINT members_name_not_empty
        CHECK (length(trim(name)) > 0)
);
