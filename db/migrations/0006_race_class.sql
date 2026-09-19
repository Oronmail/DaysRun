-- 0006: which class a boat is racing in. (0005 belongs to the Past-races work and may arrive after this one.)
-- NOR C.2.1: every entrant starts in the Suhaili class. NOR C.2.2: an entrant who makes an unapproved stop or receives material
-- assistance is placed in the Chichester class by the GGR Director or Chairman. YB carries it as a tag on the team in RaceSetup.
alter table team add column if not exists race_class text;
comment on column team.race_class is 'Suhaili or Chichester (NOR C.2.1, C.2.2); null for a replay';
