# Faster editing

Use `[` and `]` to select the previous/next visible audio clip. Alt+Up/Down chooses
an audio clip on the nearest populated visible track. Collapsed folder members
are skipped. Linked picture/audio and named group partners are selected together.
These commands also appear in Edit and command search. Inputs keep normal typing.

Edit → Place Clips at Time accepts seconds with sample precision. The earliest
selected clip begins at that time and all selected/linked offsets remain intact.
Picture-linked moves align to the project frame grid. Apply is one undo; a
numerically identical placement leaves history intact. Locked partners reject the move.

Dragging an already selected clip preserves a multi-clip selection and moves it
horizontally together as one undo. Multi-clip moves retain their track assignments.
Arrow nudges and exact placement use the same selected group.

The audio clip context menu provides trim-start/end-to-playhead commands and exact
placement. Trims check source handles and linked/shared boundaries. Edit contains the
same trim commands; Trim Tools retains reviewed roll, ripple and slide operations.
