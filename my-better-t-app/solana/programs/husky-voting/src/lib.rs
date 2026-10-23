use anchor_lang::prelude::*;

// Development placeholder. `anchor keys sync` replaces this before deployment.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgMQHGfXXGY");

const MAX_OPTIONS: usize = 6;
const MAX_DURATION: i64 = 30 * 24 * 60 * 60;

#[program]
pub mod husky_voting {
    use super::*;

    pub fn create_poll(
        ctx: Context<CreatePoll>,
        nonce: [u8; 16],
        title: String,
        description: String,
        options: Vec<String>,
        closes_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        validate_poll(&title, &description, &options, closes_at, now)?;
        ctx.accounts.poll.set_inner(Poll {
            creator: ctx.accounts.creator.key(),
            nonce,
            created_at: now,
            closes_at,
            closed: false,
            title,
            description,
            options,
            votes: [0; MAX_OPTIONS],
            bump: ctx.bumps.poll,
            deleted: false,
        });
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, option: u8) -> Result<()> {
        let poll = &mut ctx.accounts.poll;
        require!(
            !poll.deleted && !poll.closed && Clock::get()?.unix_timestamp < poll.closes_at,
            VotingError::PollClosed
        );
        require!(
            (option as usize) < poll.options.len(),
            VotingError::InvalidOption
        );
        poll.votes[option as usize] = poll.votes[option as usize]
            .checked_add(1)
            .ok_or(VotingError::Overflow)?;
        ctx.accounts.receipt.set_inner(VoteReceipt {
            poll: poll.key(),
            voter: ctx.accounts.voter.key(),
            option,
            bump: ctx.bumps.receipt,
        });
        Ok(())
    }

    pub fn close_poll(ctx: Context<ClosePoll>) -> Result<()> {
        ctx.accounts.poll.closed = true;
        Ok(())
    }

    pub fn delete_poll(ctx: Context<DeletePoll>) -> Result<()> {
        ctx.accounts.poll.closed = true;
        ctx.accounts.poll.deleted = true;
        Ok(())
    }
}

fn validate_poll(
    title: &str,
    description: &str,
    options: &[String],
    closes_at: i64,
    now: i64,
) -> Result<()> {
    require!(
        !title.trim().is_empty() && title.len() <= 100,
        VotingError::InvalidTitle
    );
    require!(description.len() <= 280, VotingError::InvalidDescription);
    require!(
        (2..=MAX_OPTIONS).contains(&options.len()),
        VotingError::InvalidOptions
    );
    for (index, option) in options.iter().enumerate() {
        require!(
            !option.trim().is_empty() && option.len() <= 60,
            VotingError::InvalidOptions
        );
        require!(
            !options[..index]
                .iter()
                .any(|previous| previous.trim().to_lowercase() == option.trim().to_lowercase()),
            VotingError::InvalidOptions
        );
    }
    require!(
        closes_at > now && closes_at <= now + MAX_DURATION,
        VotingError::InvalidDeadline
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(nonce: [u8; 16])]
pub struct CreatePoll<'info> {
    #[account(init, payer = creator, space = Poll::SPACE, seeds = [b"poll", creator.key().as_ref(), nonce.as_ref()], bump)]
    pub poll: Account<'info, Poll>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut, seeds = [b"poll", poll.creator.as_ref(), poll.nonce.as_ref()], bump = poll.bump)]
    pub poll: Account<'info, Poll>,
    // `init` rejects a second vote, including concurrent transactions. There is
    // deliberately no close/reinitialize instruction for these receipts.
    #[account(init, payer = voter, space = VoteReceipt::SPACE, seeds = [b"vote", poll.key().as_ref(), voter.key().as_ref()], bump)]
    pub receipt: Account<'info, VoteReceipt>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePoll<'info> {
    #[account(mut, has_one = creator, seeds = [b"poll", poll.creator.as_ref(), poll.nonce.as_ref()], bump = poll.bump)]
    pub poll: Account<'info, Poll>,
    pub creator: Signer<'info>,
}

// Keep a tombstone so this poll address cannot be recreated with reset results.
// Receipts and the original on-chain history remain intact.
#[derive(Accounts)]
pub struct DeletePoll<'info> {
    #[account(mut, has_one = creator, seeds = [b"poll", poll.creator.as_ref(), poll.nonce.as_ref()], bump = poll.bump)]
    pub poll: Account<'info, Poll>,
    pub creator: Signer<'info>,
}

#[account]
pub struct Poll {
    pub creator: Pubkey,
    pub nonce: [u8; 16],
    pub created_at: i64,
    pub closes_at: i64,
    pub closed: bool,
    pub title: String,
    pub description: String,
    pub options: Vec<String>,
    pub votes: [u64; MAX_OPTIONS],
    pub bump: u8,
    pub deleted: bool,
}

impl Poll {
    pub const SPACE: usize = 8
        + 32
        + 16
        + 8
        + 8
        + 1
        + 4
        + 100
        + 4
        + 280
        + 4
        + MAX_OPTIONS * (4 + 60)
        + MAX_OPTIONS * 8
        + 1
        + 1;
}

#[account]
pub struct VoteReceipt {
    pub poll: Pubkey,
    pub voter: Pubkey,
    pub option: u8,
    pub bump: u8,
}

impl VoteReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1;
}

#[error_code]
pub enum VotingError {
    #[msg("The question must contain 1–100 UTF-8 bytes.")]
    InvalidTitle,
    #[msg("The description must contain at most 280 UTF-8 bytes.")]
    InvalidDescription,
    #[msg("Provide 2–6 distinct nonempty options, each at most 60 UTF-8 bytes.")]
    InvalidOptions,
    #[msg("The closing time must be in the next 30 days.")]
    InvalidDeadline,
    #[msg("Voting has closed.")]
    PollClosed,
    #[msg("This option does not belong to the poll.")]
    InvalidOption,
    #[msg("The vote count is at capacity.")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_poll_rules_and_utf8_limits() {
        let options = vec!["First".to_string(), "Second".to_string()];
        assert!(validate_poll("Question?", "", &options, 101, 100).is_ok());
        assert!(validate_poll(" ", "", &options, 101, 100).is_err());
        assert!(validate_poll(&"🦊".repeat(26), "", &options, 101, 100).is_err());
        assert!(validate_poll("Q", &"x".repeat(281), &options, 101, 100).is_err());
        assert!(validate_poll("Q", "", &["same".into(), " SAME ".into()], 101, 100).is_err());
        assert!(validate_poll("Q", "", &["one".into()], 101, 100).is_err());
        assert!(validate_poll("Q", "", &options, 100, 100).is_err());
        assert!(validate_poll("Q", "", &options, 101 + MAX_DURATION, 100).is_err());
    }

    #[test]
    fn account_layout_matches_the_browser_codec() {
        let poll = Poll {
            creator: Pubkey::new_from_array([1; 32]),
            nonce: [2; 16],
            created_at: 100,
            closes_at: 200,
            closed: false,
            title: "Question?".into(),
            description: "".into(),
            options: vec!["Yes".into(), "No".into()],
            votes: [3, 2, 0, 0, 0, 0],
            bump: 254,
            deleted: false,
        };
        let mut bytes = Vec::new();
        poll.try_serialize(&mut bytes).unwrap();
        assert_eq!(&bytes[..8], &[110, 234, 167, 188, 231, 136, 153, 111]);
        assert_eq!(&bytes[8..40], &[1; 32]);
        assert_eq!(&bytes[40..56], &[2; 16]);
        assert_eq!(&bytes[56..64], &100_i64.to_le_bytes());
        assert_eq!(bytes[72], 0);
        assert!(bytes.len() <= Poll::SPACE);
        assert_eq!(VoteReceipt::SPACE, 74);
    }

    // Exercise Anchor's real account constraints and instruction handler without
    // a validator; no clock or CPI is needed for deletion.
    fn delete_as(signer: Pubkey, is_signer: bool, closed: bool) -> Result<Poll> {
        let creator = Pubkey::new_from_array([1; 32]);
        let nonce = [2; 16];
        let (address, bump) =
            Pubkey::find_program_address(&[b"poll", creator.as_ref(), nonce.as_ref()], &crate::ID);
        let poll = Poll {
            creator,
            nonce,
            created_at: 100,
            closes_at: 200,
            closed,
            title: "Question?".into(),
            description: "".into(),
            options: vec!["Yes".into(), "No".into()],
            votes: [3, 2, 0, 0, 0, 0],
            bump,
            deleted: false,
        };
        let mut data = vec![0; Poll::SPACE];
        poll.try_serialize(&mut data.as_mut_slice())?;
        let mut poll_lamports = 1;
        let mut signer_lamports = 1;
        let mut signer_data = [];
        let system = anchor_lang::system_program::ID;
        let infos = [
            AccountInfo::new(
                &address,
                false,
                true,
                &mut poll_lamports,
                &mut data,
                &crate::ID,
                false,
                0,
            ),
            AccountInfo::new(
                &signer,
                is_signer,
                false,
                &mut signer_lamports,
                &mut signer_data,
                &system,
                false,
                0,
            ),
        ];
        let mut remaining = infos.as_slice();
        let mut bumps = DeletePollBumps::default();
        let mut reallocs = std::collections::BTreeSet::new();
        let mut accounts =
            DeletePoll::try_accounts(&crate::ID, &mut remaining, &[], &mut bumps, &mut reallocs)?;
        husky_voting::delete_poll(Context::new(&crate::ID, &mut accounts, &[], bumps))?;
        accounts.exit(&crate::ID)?;
        let result = Poll::try_deserialize(&mut infos[0].try_borrow_data()?.as_ref());
        result
    }

    #[test]
    fn only_the_creator_can_delete_and_must_sign() {
        let creator = Pubkey::new_from_array([1; 32]);
        assert!(delete_as(Pubkey::new_unique(), true, false).is_err());
        assert!(delete_as(creator, false, false).is_err());
    }

    #[test]
    fn creator_can_delete_open_and_ended_polls_without_losing_receipts_or_results() {
        for closed in [false, true] {
            let poll = delete_as(Pubkey::new_from_array([1; 32]), true, closed).unwrap();
            assert!(poll.deleted);
            assert!(poll.closed);
            assert_eq!(poll.votes, [3, 2, 0, 0, 0, 0]);
            assert_eq!(poll.title, "Question?");
        }
    }

    #[test]
    fn receipts_are_scoped_to_both_poll_and_wallet() {
        let poll = Pubkey::new_unique();
        let voter = Pubkey::new_unique();
        let derive = |p: Pubkey, v: Pubkey| {
            Pubkey::find_program_address(&[b"vote", p.as_ref(), v.as_ref()], &crate::ID).0
        };
        assert_eq!(derive(poll, voter), derive(poll, voter));
        assert_ne!(derive(poll, voter), derive(poll, Pubkey::new_unique()));
        assert_ne!(derive(poll, voter), derive(Pubkey::new_unique(), voter));
    }
}
