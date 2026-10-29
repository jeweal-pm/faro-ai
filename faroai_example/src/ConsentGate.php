<?php

declare(strict_types=1);

namespace FaroAi;

/** Host application supplies the current, server-validated consent state. */
final class ConsentGate
{
    /** @var array<string, mixed> */
    private array $state;

    /** @param array<string, mixed> $state */
    public function __construct(array $state)
    {
        $this->state = $state;
    }

    public function canChat(): bool
    {
        return !empty($this->state['ai_chat']);
    }

    public function canImprove(): bool
    {
        return !empty($this->state['ai_improve']);
    }

    public function canTrain(): bool
    {
        return !empty($this->state['ai_training']);
    }
}
